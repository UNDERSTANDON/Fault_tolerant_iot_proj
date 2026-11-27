#include "mqtt_connectivity.h"

#include <cstdio>
#include <cstring>

#if CONFIG_CONNECTIVITY_ENABLE_MOCK_EVENT_NOTIFICATIONS
#include "cJSON.h"
#include "event_notifier.h"
#endif
#include "esp_event.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "mqtt_client.h"

#if CONFIG_MBEDTLS_CERTIFICATE_BUNDLE
#include "esp_crt_bundle.h"
#endif

#if CONFIG_CONNECTIVITY_MQTT_USE_CUSTOM_CA
extern "C"
{
    extern const uint8_t broker_ca_pem_start[] asm("_binary_broker_ca_pem_start");
    extern const uint8_t broker_ca_pem_end[] asm("_binary_broker_ca_pem_end");
}
#endif

namespace
{
    constexpr char TAG[] = "mqtt_connectivity";
    constexpr char TEST_TOPIC[] = "demo/esp32-mqtt-connectivity/test";
    constexpr char TEST_NOTIFICATION_TOPIC[] = "test/esp32/notifications/v1";
    constexpr TickType_t PUBLISH_INTERVAL = pdMS_TO_TICKS(30000);
#if CONFIG_CONNECTIVITY_ENABLE_MOCK_EVENT_NOTIFICATIONS
    constexpr TickType_t MOCK_NOTIFICATION_INTERVAL = pdMS_TO_TICKS(60000);
    constexpr uint32_t MOCK_NOTIFICATION_LIMIT = 4;
#endif
    constexpr EventBits_t MQTT_CONNECTED_BIT = BIT0;
    constexpr int MQTT_RECONNECT_TIMEOUT_MS = 10000;
    constexpr int MQTT_NETWORK_TIMEOUT_MS = 3000;

    esp_mqtt_client_handle_t mqtt_client = nullptr;
    EventGroupHandle_t mqtt_event_group = nullptr;
    TaskHandle_t publish_task_handle = nullptr;
    char device_id[13] = {};
#if CONFIG_CONNECTIVITY_ENABLE_MOCK_EVENT_NOTIFICATIONS
    char test_run_id[17] = {};
#endif
    uint32_t publish_sequence = 0;
    bool previously_connected = false;

    void mqtt_event_handler(void *, esp_event_base_t, int32_t event_id,
                            void *event_data)
    {
        const auto *event = static_cast<const esp_mqtt_event_t *>(event_data);
        switch (event_id)
        {
        case MQTT_EVENT_CONNECTED:
            if (previously_connected)
            {
                ESP_LOGI(TAG, "MQTT reconnected");
            }
            else
            {
                ESP_LOGI(TAG, "MQTT connected");
            }
            previously_connected = true;
            xEventGroupSetBits(mqtt_event_group, MQTT_CONNECTED_BIT);
            break;
        case MQTT_EVENT_DISCONNECTED:
            ESP_LOGW(TAG, "MQTT disconnected; client retry is scheduled");
            xEventGroupClearBits(mqtt_event_group, MQTT_CONNECTED_BIT);
            break;
        case MQTT_EVENT_ERROR:
            if (event != nullptr && event->error_handle != nullptr)
            {
                ESP_LOGW(TAG, "MQTT connection error type %d; client retry is scheduled",
                         static_cast<int>(event->error_handle->error_type));
            }
            else
            {
                ESP_LOGW(TAG, "MQTT connection error; client retry is scheduled");
            }
            break;
        default:
            break;
        }
    }

#if CONFIG_CONNECTIVITY_ENABLE_MOCK_EVENT_NOTIFICATIONS
    class MqttNotificationSink final : public event_notifier::NotificationSink
    {
    public:
        bool notify_warning(const event_notifier::Notification &notification) override
        {
            return publish(notification, "warning");
        }

        bool notify_critical(const event_notifier::Notification &notification) override
        {
            return publish(notification, "critical");
        }

    private:
        bool publish(const event_notifier::Notification &notification,
                     const char *severity)
        {
            const uint32_t sequence = sequence_ + 1;
            char event_id[48] = {};
            const int event_id_length = std::snprintf(
                event_id, sizeof(event_id), "%s-%s-%lu", device_id, test_run_id,
                static_cast<unsigned long>(sequence));
            if (event_id_length < 0 ||
                static_cast<std::size_t>(event_id_length) >= sizeof(event_id))
            {
                ESP_LOGE(TAG, "Could not format synthetic event ID");
                return false;
            }

            cJSON *event = cJSON_CreateObject();
            if (event == nullptr)
            {
                ESP_LOGE(TAG, "Could not allocate synthetic event");
                return false;
            }
            const bool fields_added =
                cJSON_AddNumberToObject(event, "schema_version", 1) != nullptr &&
                cJSON_AddStringToObject(event, "kind", "synthetic_notification") != nullptr &&
                cJSON_AddBoolToObject(event, "is_test", true) != nullptr &&
                cJSON_AddStringToObject(event, "event_id", event_id) != nullptr &&
                cJSON_AddStringToObject(event, "source", "esp32_mock") != nullptr &&
                cJSON_AddStringToObject(event, "device_id", device_id) != nullptr &&
                cJSON_AddStringToObject(event, "test_run_id", test_run_id) != nullptr &&
                cJSON_AddNumberToObject(event, "sequence", sequence) != nullptr &&
                cJSON_AddStringToObject(event, "severity", severity) != nullptr &&
                cJSON_AddStringToObject(event, "title", notification.title) != nullptr &&
                cJSON_AddStringToObject(event, "message", notification.message) != nullptr &&
                cJSON_AddNumberToObject(
                    event, "timestamp_ms",
                    static_cast<double>(esp_timer_get_time() / 1000)) != nullptr &&
                cJSON_AddStringToObject(
                    event, "timestamp_kind", "device_uptime_ms") != nullptr;
            if (!fields_added)
            {
                cJSON_Delete(event);
                ESP_LOGE(TAG, "Could not construct synthetic event payload");
                return false;
            }

            char *payload = cJSON_PrintUnformatted(event);
            cJSON_Delete(event);
            if (payload == nullptr)
            {
                ESP_LOGE(TAG, "Could not serialize synthetic event payload");
                return false;
            }

            const int message_id = esp_mqtt_client_publish(
                mqtt_client, TEST_NOTIFICATION_TOPIC, payload, 0, 1, 0);
            cJSON_free(payload);
            if (message_id < 0)
            {
                ESP_LOGW(TAG, "Synthetic event was not accepted by the local MQTT client");
                return false;
            }

            sequence_ = sequence;
            ESP_LOGI(TAG, "Synthetic %s notification accepted locally; "
                          "broker and Firestore acknowledgement are pending "
                          "(event %s)",
                     severity, event_id);
            return true;
        }

        uint32_t sequence_ = 0;
    };

    void mock_notification_task(void *)
    {
        MqttNotificationSink sink;
        const event_notifier::EventNotifier notifier(sink);
        for (uint32_t index = 0; index < MOCK_NOTIFICATION_LIMIT; ++index)
        {
            xEventGroupWaitBits(mqtt_event_group, MQTT_CONNECTED_BIT, pdFALSE,
                                pdTRUE, portMAX_DELAY);

            const bool is_critical = (index % 2) != 0;
            const event_notifier::Notification notification = {
                is_critical ? event_notifier::Severity::critical
                            : event_notifier::Severity::warning,
                is_critical ? "Synthetic critical test event"
                            : "Synthetic warning test event",
                is_critical ? "Generated test notification; no physical hazard is present."
                            : "Generated test notification; no physical sensor is represented."};
            if (!notifier.notify(notification))
            {
                ESP_LOGW(TAG, "Synthetic notification sink rejected event %lu",
                         static_cast<unsigned long>(index + 1));
            }

            if (index + 1 < MOCK_NOTIFICATION_LIMIT)
            {
                vTaskDelay(MOCK_NOTIFICATION_INTERVAL);
            }
        }
        vTaskDelete(nullptr);
    }
#endif

    void publish_task(void *)
    {
        for (;;)
        {
            xEventGroupWaitBits(mqtt_event_group, MQTT_CONNECTED_BIT, pdFALSE,
                                pdTRUE, portMAX_DELAY);

            char payload[128] = {};
            const int payload_length = std::snprintf(
                payload, sizeof(payload),
                "{\"schema_version\":1,\"kind\":\"connectivity_test\","
                "\"device_id\":\"%s\",\"sequence\":%lu}",
                device_id, static_cast<unsigned long>(++publish_sequence));
            if (payload_length < 0 ||
                static_cast<std::size_t>(payload_length) >= sizeof(payload))
            {
                ESP_LOGE(TAG, "Could not format the connectivity test payload");
            }
            else
            {
                const int message_id = esp_mqtt_client_publish(
                    mqtt_client, TEST_TOPIC, payload, payload_length, 0, 0);
                if (message_id < 0)
                {
                    ESP_LOGW(TAG, "MQTT test publication failed locally");
                }
                else
                {
                    ESP_LOGI(TAG, "MQTT test publication accepted locally; "
                                  "broker receipt is unconfirmed (QoS 0)");
                }
            }

            vTaskDelay(PUBLISH_INTERVAL);
        }
    }

    bool configure_broker(esp_mqtt_client_config_t &config)
    {
        const char *uri = CONFIG_CONNECTIVITY_MQTT_BROKER_URI;
        if (uri[0] == '\0')
        {
            ESP_LOGW(TAG, "MQTT is disabled; set the broker URI in ESP-IDF configuration");
            return false;
        }

        if (std::strstr(uri, "@") != nullptr)
        {
            ESP_LOGE(TAG, "Broker URI must not contain embedded credentials");
            return false;
        }

        if (std::strncmp(uri, "mqtt://", 7) == 0)
        {
            if (CONFIG_CONNECTIVITY_MQTT_USERNAME[0] != '\0' ||
                CONFIG_CONNECTIVITY_MQTT_PASSWORD[0] != '\0')
            {
                ESP_LOGE(TAG, "MQTT credentials require a TLS broker URI");
                return false;
            }
            config.broker.address.uri = uri;
        }
        else if (std::strncmp(uri, "mqtts://", 8) == 0)
        {
#if CONFIG_CONNECTIVITY_MQTT_USE_CUSTOM_CA
            config.broker.address.uri = uri;
            config.broker.verification.certificate =
                reinterpret_cast<const char *>(broker_ca_pem_start);
            config.broker.verification.certificate_len =
                static_cast<std::size_t>(broker_ca_pem_end - broker_ca_pem_start);
#elif CONFIG_MBEDTLS_CERTIFICATE_BUNDLE
            config.broker.address.uri = uri;
            config.broker.verification.crt_bundle_attach = esp_crt_bundle_attach;
#else
            ESP_LOGE(TAG, "mqtts:// requires a trusted custom CA or ESP-TLS certificate bundle");
            return false;
#endif
        }
        else
        {
            ESP_LOGE(TAG, "Broker URI must use mqtt:// or mqtts://");
            return false;
        }

        if (CONFIG_CONNECTIVITY_MQTT_USERNAME[0] != '\0')
        {
            config.credentials.username = CONFIG_CONNECTIVITY_MQTT_USERNAME;
        }
        if (CONFIG_CONNECTIVITY_MQTT_PASSWORD[0] != '\0')
        {
            config.credentials.authentication.password =
                CONFIG_CONNECTIVITY_MQTT_PASSWORD;
        }
        return true;
    }
}

namespace mqtt_connectivity
{
    void start()
    {
        if (mqtt_client != nullptr)
        {
            return;
        }

        uint8_t mac[6] = {};
        const esp_err_t mac_result = esp_read_mac(mac, ESP_MAC_WIFI_STA);
        if (mac_result != ESP_OK)
        {
            ESP_LOGE(TAG, "Could not read the station MAC address: %s",
                     esp_err_to_name(mac_result));
            return;
        }
        std::snprintf(device_id, sizeof(device_id),
                      "%02x%02x%02x%02x%02x%02x",
                      mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
#if CONFIG_CONNECTIVITY_ENABLE_MOCK_EVENT_NOTIFICATIONS
        std::snprintf(test_run_id, sizeof(test_run_id), "%08lx%08lx",
                      static_cast<unsigned long>(esp_random()),
                      static_cast<unsigned long>(esp_random()));
#endif

        mqtt_event_group = xEventGroupCreate();
        if (mqtt_event_group == nullptr)
        {
            ESP_LOGE(TAG, "Could not create the MQTT event group");
            return;
        }

        esp_mqtt_client_config_t config = {};
        if (!configure_broker(config))
        {
            vEventGroupDelete(mqtt_event_group);
            mqtt_event_group = nullptr;
            return;
        }
        config.session.keepalive = 60;
        config.network.reconnect_timeout_ms = MQTT_RECONNECT_TIMEOUT_MS;
        config.network.timeout_ms = MQTT_NETWORK_TIMEOUT_MS;
        config.network.disable_auto_reconnect = false;

        mqtt_client = esp_mqtt_client_init(&config);
        if (mqtt_client == nullptr)
        {
            ESP_LOGE(TAG, "Could not initialize the MQTT client");
            vEventGroupDelete(mqtt_event_group);
            mqtt_event_group = nullptr;
            return;
        }

        esp_err_t result = esp_mqtt_client_register_event(
            mqtt_client, MQTT_EVENT_ANY, mqtt_event_handler, nullptr);
        if (result != ESP_OK)
        {
            ESP_LOGE(TAG, "Could not register MQTT event handler: %s",
                     esp_err_to_name(result));
            esp_mqtt_client_destroy(mqtt_client);
            mqtt_client = nullptr;
            vEventGroupDelete(mqtt_event_group);
            mqtt_event_group = nullptr;
            return;
        }

        if (xTaskCreate(publish_task, "mqtt_test_publish", 4096, nullptr, 5,
                        &publish_task_handle) != pdPASS)
        {
            ESP_LOGE(TAG, "Could not create MQTT test publication task");
            esp_mqtt_client_unregister_event(
                mqtt_client, MQTT_EVENT_ANY, mqtt_event_handler);
            esp_mqtt_client_destroy(mqtt_client);
            mqtt_client = nullptr;
            vEventGroupDelete(mqtt_event_group);
            mqtt_event_group = nullptr;
            return;
        }

        result = esp_mqtt_client_start(mqtt_client);
        if (result != ESP_OK)
        {
            ESP_LOGE(TAG, "Could not start the MQTT client: %s",
                     esp_err_to_name(result));
            vTaskDelete(publish_task_handle);
            publish_task_handle = nullptr;
            esp_mqtt_client_unregister_event(
                mqtt_client, MQTT_EVENT_ANY, mqtt_event_handler);
            esp_mqtt_client_destroy(mqtt_client);
            mqtt_client = nullptr;
            vEventGroupDelete(mqtt_event_group);
            mqtt_event_group = nullptr;
            return;
        }

        ESP_LOGI(TAG, "MQTT client started after Wi-Fi obtained an IP address");
#if CONFIG_CONNECTIVITY_ENABLE_MOCK_EVENT_NOTIFICATIONS
        if (xTaskCreate(mock_notification_task, "mock_event_publish", 4096,
                        nullptr, 4, nullptr) != pdPASS)
        {
            ESP_LOGE(TAG, "Could not create synthetic event test publisher task");
        }
#endif
    }
}
