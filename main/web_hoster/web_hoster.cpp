#include "web_hoster.h"
#include <cstdio>
#include <cstring>
#include <local_controller.h>
#include "gpio_mapping.h"
#include <cstddef>
#include <algorithm>
#include "cJSON.h"
#include "hardware_controller.h"
#include "mqtt_connectivity.h"
#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "mdns.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "lwip/ip4_addr.h"

extern "C"
{
     extern const uint8_t index_html_start[] asm("_binary_index_html_start");
     extern const uint8_t index_html_end[] asm("_binary_index_html_end");
     extern const uint8_t style_css_start[] asm("_binary_style_css_start");
     extern const uint8_t style_css_end[] asm("_binary_style_css_end");
     extern const uint8_t app_js_start[] asm("_binary_app_js_start");
     extern const uint8_t app_js_end[] asm("_binary_app_js_end");
}

namespace
{
     constexpr char TAG[] = "web_hoster";
     constexpr char MDNS_HOSTNAME[] = "esp32-lan";
     constexpr char MDNS_INSTANCE_NAME[] = "ESP32 Fault Tolerant IoT LAN";
     constexpr uint16_t WEB_SERVER_PORT = 80;
     constexpr EventBits_t WIFI_CONNECTED_BIT = BIT0;
     constexpr EventBits_t WIFI_FAILED_BIT = BIT1;
     constexpr EventBits_t WIFI_AP_STARTED_BIT = BIT2;
     constexpr EventBits_t WIFI_RECONNECT_BIT = BIT3;
     constexpr TickType_t WIFI_CONNECT_TIMEOUT = pdMS_TO_TICKS(15000);
     constexpr TickType_t WIFI_RECONNECT_DELAYS[] = {
         pdMS_TO_TICKS(5000), pdMS_TO_TICKS(10000),
         pdMS_TO_TICKS(20000), pdMS_TO_TICKS(30000)};
     httpd_handle_t web_server = nullptr;
     EventGroupHandle_t wifi_event_group = nullptr;
     local_controller::LocalController network_policy;
     esp_netif_t *wifi_station_netif = nullptr;
     esp_netif_t *wifi_ap_netif = nullptr;
     esp_event_handler_instance_t wifi_event_instance = nullptr;
     esp_event_handler_instance_t ip_event_instance = nullptr;
     bool wifi_driver_initialized = false;
     bool wifi_started = false;
     bool wifi_handlers_registered = false;
     bool mdns_started = false;
     TaskHandle_t wifi_reconnect_task_handle = nullptr;
     std::string house_wifi_ssid;
     std::string house_wifi_password;
     bool station_config_valid = false;

     struct EmbeddedAsset
     {
          const uint8_t *start;
          const uint8_t *end;
          const char *content_type;
     };

     EmbeddedAsset index_html_asset = {
         index_html_start, index_html_end, "text/html; charset=utf-8"};
     EmbeddedAsset style_css_asset = {
         style_css_start, style_css_end, "text/css; charset=utf-8"};
     EmbeddedAsset app_js_asset = {
         app_js_start, app_js_end, "application/javascript; charset=utf-8"};

     void wifi_event_handler(void *, esp_event_base_t event_base,
                             int32_t event_id, void *event_data)
     {
          if (wifi_event_group == nullptr)
          {
               return;
          }
          if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED)
          {
               const auto *event =
                   static_cast<const wifi_event_sta_disconnected_t *>(event_data);
               ESP_LOGW(TAG, "Wi-Fi disconnected (reason %d)", event->reason);
               xEventGroupClearBits(wifi_event_group, WIFI_CONNECTED_BIT);
               xEventGroupSetBits(wifi_event_group, WIFI_FAILED_BIT |
                                                        WIFI_RECONNECT_BIT);
               network_policy.station_disconnected();
               ESP_LOGW(TAG, "Network state: %s",
                        local_controller::LocalController::state_name(network_policy.state()));
          }
          else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_AP_START)
          {
               xEventGroupSetBits(wifi_event_group, WIFI_AP_STARTED_BIT);
          }
          else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP)
          {
               const auto *event =
                   static_cast<const ip_event_got_ip_t *>(event_data);
               ESP_LOGI(TAG, "Connected with IP address " IPSTR,
                        IP2STR(&event->ip_info.ip));
               xEventGroupClearBits(wifi_event_group, WIFI_FAILED_BIT);
               xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
               network_policy.station_connected_event();
               ESP_LOGI(TAG, "Network state: %s",
                        local_controller::LocalController::state_name(network_policy.state()));
               mqtt_connectivity::start();
          }
     }

     esp_err_t index_handler(httpd_req_t *request)
     {
          const auto *asset =
              static_cast<const EmbeddedAsset *>(request->user_ctx);
          const std::size_t asset_size =
              static_cast<std::size_t>(asset->end - asset->start);
          httpd_resp_set_type(request, asset->content_type);
          httpd_resp_set_hdr(request, "Cache-Control", "no-store");
          return httpd_resp_send(request,
                                 reinterpret_cast<const char *>(asset->start),
                                 asset_size);
     }

     esp_err_t network_status_handler(httpd_req_t *request)
     {
          char response[160];
          const int length = std::snprintf(
              response, sizeof(response),
              "{\"state\":\"%s\",\"station_connected\":%s,\"fallback_ap_active\":%s}",
              local_controller::LocalController::state_name(network_policy.state()),
              network_policy.station_connected() ? "true" : "false",
              network_policy.fallback_ap_active() ? "true" : "false");
          if (length < 0 || static_cast<std::size_t>(length) >= sizeof(response))
          {
               return httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR,
                                         "Unable to format network status");
          }
          httpd_resp_set_type(request, "application/json");
          httpd_resp_set_hdr(request, "Cache-Control", "no-store");
          return httpd_resp_send(request, response, length);
     }

     esp_err_t hardware_state_handler(httpd_req_t *request)
     {
          hardware_controller::HardwareSnapshot snap = {};
          if (!hardware_controller::get_snapshot(snap))
          {
               return httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR,
                                         "Hardware state unavailable");
          }
          uint8_t mac[6] = {};
          char dev_id[16] = "esp32-s3";
          if (esp_read_mac(mac, ESP_MAC_WIFI_STA) == ESP_OK)
          {
               std::snprintf(dev_id, sizeof(dev_id), "%02x%02x%02x%02x%02x%02x",
                             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
          }
          char json_buf[768] = {};
          if (!hardware_controller::format_snapshot_json(snap, dev_id, json_buf, sizeof(json_buf)))
          {
               return httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR,
                                         "Failed to serialize hardware snapshot");
          }
          httpd_resp_set_type(request, "application/json");
          httpd_resp_set_hdr(request, "Cache-Control", "no-store");
          return httpd_resp_send(request, json_buf, HTTPD_RESP_USE_STRLEN);
     }

     esp_err_t hardware_command_handler(httpd_req_t *request)
     {
          if (request->content_len <= 0 || request->content_len > 512)
          {
               return httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST,
                                         "Invalid command body size");
          }

          char content_type[64] = {};
          if (httpd_req_get_hdr_value_str(request, "Content-Type", content_type, sizeof(content_type)) != ESP_OK ||
              std::strncmp(content_type, "application/json", 16) != 0)
          {
               return httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST,
                                         "Content-Type must be application/json");
          }

          char origin_hdr[128] = {};
          char host_hdr[64] = {};
          if (httpd_req_get_hdr_value_str(request, "Origin", origin_hdr, sizeof(origin_hdr)) == ESP_OK &&
              httpd_req_get_hdr_value_str(request, "Host", host_hdr, sizeof(host_hdr)) == ESP_OK)
          {
               char expected_origin[96] = {};
               std::snprintf(expected_origin, sizeof(expected_origin), "http://%s", host_hdr);
               if (std::strcmp(origin_hdr, expected_origin) != 0)
               {
                    return httpd_resp_send_err(request, HTTPD_403_FORBIDDEN,
                                              "Cross-origin hardware command rejected");
               }
          }
          char body[513] = {};
          int total_read = 0;
          while (total_read < request->content_len)
          {
               const int chunk = httpd_req_recv(
                   request, body + total_read,
                   static_cast<std::size_t>(request->content_len - total_read));
               if (chunk <= 0)
               {
                    return httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST,
                                              "Incomplete command body");
               }
               total_read += chunk;
          }
          body[total_read] = '\0';

          cJSON *root = cJSON_Parse(body);
          if (root == nullptr || !cJSON_IsObject(root))
          {
               cJSON_Delete(root);
               return httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST, "Malformed JSON");
          }

          const cJSON *dev_item = cJSON_GetObjectItemCaseSensitive(root, "deviceId");
          const cJSON *state_item = cJSON_GetObjectItemCaseSensitive(root, "targetState");
          const cJSON *cmd_item = cJSON_GetObjectItemCaseSensitive(root, "commandId");

          const char *device_id = cJSON_IsString(dev_item) ? dev_item->valuestring : nullptr;
          const char *target_state = cJSON_IsString(state_item) ? state_item->valuestring : nullptr;
          const char *command_id = cJSON_IsString(cmd_item) ? cmd_item->valuestring : "cmd-ap";

          hardware_controller::CommandResult cmd_res = {};
          const bool ok = hardware_controller::execute_device_command(device_id, target_state, cmd_res);
          cJSON_Delete(root);

          char ack_buf[384] = {};
          const uint64_t ts_ms = static_cast<uint64_t>(esp_timer_get_time() / 1000ULL);
          if (!hardware_controller::format_command_ack_json(command_id, cmd_res, ts_ms, ack_buf, sizeof(ack_buf)))
          {
               return httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR, "Failed to serialize ACK");
          }

          httpd_resp_set_type(request, "application/json");
          httpd_resp_set_hdr(request, "Cache-Control", "no-store");
          if (!ok)
          {
               httpd_resp_set_status(request, "400 Bad Request");
          }
          return httpd_resp_send(request, ack_buf, HTTPD_RESP_USE_STRLEN);
     }
}

// This is the web hoster module for the ESP32-S3
// The idea is instead of making an app for the UI/UX,
// we can just use a LAN website to manage and uses the IoT devices.
namespace web_hoster
{
     WebHoster::WebHoster()
     {
          // Constructor implementation
     }

     // Public section

     // LAN function is quite complex
     // 1. While the house network is not down, ESP32 will connect to the
     // house network and start the web server.
     // 2. If the house network is down, ESP32 will start its own AP
     // and start the web server.
     // The idea is to make sure that the user can remote control the from afar
     // and then still can control them while downtime of the house network.
     // This only compromise the remote capability, but still can control the IoT devices locally.
     void WebHoster::start_local_network()
     {
          ESP_LOGI(TAG, "Starting local network");
          if (local_controller::validate_gpio_mappings() !=
              local_controller::GpioMappingStatus::valid)
          {
               ESP_LOGE(TAG, "Configured GPIO role mapping is invalid");
               return;
          }

          if (!hardware_controller::init() || !hardware_controller::start_polling_task())
          {
               ESP_LOGW(TAG, "Hardware polling initialization failed; network host remains active");
          }

          std::string ssid;
          std::string password;
          station_config_valid = get_wifi_config(ssid, password);
          if (station_config_valid)
          {
               house_wifi_ssid = ssid;
               house_wifi_password = password;
          }

          if (!initialize_network_stack(station_config_valid))
          {
               network_policy.fallback_ap_failed();
               ESP_LOGE(TAG, "Network initialization failed; state: %s",
                        local_controller::LocalController::state_name(network_policy.state()));
               return;
          }

          bool connected = false;
          if (station_config_valid)
          {
               for (int attempt = 0; attempt < 3 && !connected; ++attempt)
               {
                    ESP_LOGI(TAG, "Station connection attempt %d of 3", attempt + 1);
                    connected = connect_to_house_network(ssid, password);
               }
          }

          if (!connected && !start_fallback_ap())
          {
               network_policy.fallback_ap_failed();
               ESP_LOGE(TAG, "No station or fallback network is available");
               return;
          }

          if (!start_mDNS())
          {
               ESP_LOGW(TAG, "Network is available but mDNS advertisement failed");
          }
          if (!start_web_server())
          {
               ESP_LOGE(TAG, "Embedded dashboard HTTP server could not start");
               network_policy.services_unavailable();
               return;
          }

          if (station_config_valid && wifi_reconnect_task_handle == nullptr)
          {
               const BaseType_t task_result = xTaskCreate(
                   WebHoster::reconnect_to_house_network_task,
                   "wifi_reconnect", 4096, nullptr, 5,
                   &wifi_reconnect_task_handle);
               if (task_result != pdPASS)
               {
                    wifi_reconnect_task_handle = nullptr;
                    ESP_LOGE(TAG, "Failed to create Wi-Fi reconnect task");
                    if (!connected)
                    {
                         ESP_LOGE(TAG, "Fallback AP remains available, but station retry is disabled");
                    }
               }
          }

          ESP_LOGI(TAG, "Embedded dashboard: http://192.168.4.1/ when connected to the fallback AP");
     }

     bool WebHoster::initialize_network_stack(bool create_station_netif)
     {
          if (wifi_event_group == nullptr)
          {
               wifi_event_group = xEventGroupCreate();
               if (wifi_event_group == nullptr)
               {
                    ESP_LOGE(TAG, "Failed to create Wi-Fi event group");
                    return false;
               }
          }

          esp_err_t result = nvs_flash_init();
          if (result != ESP_OK && result != ESP_ERR_INVALID_STATE)
          {
               ESP_LOGE(TAG, "Failed to initialize NVS: %s", esp_err_to_name(result));
               return false;
          }

          result = esp_netif_init();
          if (result != ESP_OK && result != ESP_ERR_INVALID_STATE)
          {
               ESP_LOGE(TAG, "Failed to initialize network interface: %s",
                        esp_err_to_name(result));
               return false;
          }

          result = esp_event_loop_create_default();
          if (result != ESP_OK && result != ESP_ERR_INVALID_STATE)
          {
               ESP_LOGE(TAG, "Failed to create default event loop: %s",
                        esp_err_to_name(result));
               return false;
          }

          if (create_station_netif && wifi_station_netif == nullptr)
          {
               wifi_station_netif = esp_netif_create_default_wifi_sta();
               if (wifi_station_netif == nullptr)
               {
                    ESP_LOGE(TAG, "Failed to create Wi-Fi station interface");
                    return false;
               }
          }

          if (!wifi_driver_initialized)
          {
               wifi_init_config_t init_config = WIFI_INIT_CONFIG_DEFAULT();
               result = esp_wifi_init(&init_config);
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to initialize Wi-Fi: %s",
                             esp_err_to_name(result));
                    return false;
               }
               wifi_driver_initialized = true;
          }

          if (!wifi_handlers_registered)
          {
               result = esp_event_handler_instance_register(
                   WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, nullptr,
                   &wifi_event_instance);
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to register Wi-Fi event handler: %s",
                             esp_err_to_name(result));
                    return false;
               }
               result = esp_event_handler_instance_register(
                   IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, nullptr,
                   &ip_event_instance);
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to register IP event handler: %s",
                             esp_err_to_name(result));
                    esp_event_handler_instance_unregister(
                        WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_instance);
                    wifi_event_instance = nullptr;
                    return false;
               }
               wifi_handlers_registered = true;
          }
          return true;
     }

     bool WebHoster::start_fallback_ap()
     {
          if (network_policy.fallback_ap_active())
          {
               return true;
          }
          if (!initialize_network_stack(false))
          {
               network_policy.fallback_ap_failed();
               return false;
          }

          const char *ap_ssid = CONFIG_CONNECTIVITY_FALLBACK_AP_SSID;
          const char *ap_password = CONFIG_CONNECTIVITY_FALLBACK_AP_PASSWORD;
          const std::size_t ssid_length = std::strlen(ap_ssid);
          const std::size_t password_length = std::strlen(ap_password);
          if (ssid_length == 0 || ssid_length > 32 ||
              password_length < 8 || password_length > 63)
          {
               ESP_LOGE(TAG, "Fallback AP requires a 1-32 byte SSID and an 8-63 byte password");
               network_policy.fallback_ap_failed();
               return false;
          }

          if (wifi_ap_netif == nullptr)
          {
               wifi_ap_netif = esp_netif_create_default_wifi_ap();
               if (wifi_ap_netif == nullptr)
               {
                    ESP_LOGE(TAG, "Failed to create fallback AP network interface");
                    network_policy.fallback_ap_failed();
                    return false;
               }
          }

          wifi_config_t ap_config = {};
          std::memcpy(ap_config.ap.ssid, ap_ssid, ssid_length);
          ap_config.ap.ssid_len = ssid_length;
          std::memcpy(ap_config.ap.password, ap_password, password_length);
          ap_config.ap.channel = 1;
          ap_config.ap.max_connection = 4;
          ap_config.ap.authmode = WIFI_AUTH_WPA2_PSK;

          esp_err_t result = esp_netif_dhcps_stop(wifi_ap_netif);
          if (result != ESP_OK && result != ESP_ERR_ESP_NETIF_DHCP_ALREADY_STOPPED)
          {
               ESP_LOGE(TAG, "Failed to stop fallback AP DHCP server: %s",
                        esp_err_to_name(result));
               network_policy.fallback_ap_failed();
               return false;
          }

          esp_netif_ip_info_t ap_ip_info = {};
          IP4_ADDR(&ap_ip_info.ip, 192, 168, 4, 1);
          IP4_ADDR(&ap_ip_info.gw, 192, 168, 4, 1);
          IP4_ADDR(&ap_ip_info.netmask, 255, 255, 255, 0);
          result = esp_netif_set_ip_info(wifi_ap_netif, &ap_ip_info);
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to configure fallback AP address: %s",
                        esp_err_to_name(result));
               network_policy.fallback_ap_failed();
               return false;
          }

          const wifi_mode_t mode = wifi_station_netif == nullptr
                                       ? WIFI_MODE_AP
                                       : WIFI_MODE_APSTA;
          result = esp_wifi_set_mode(mode);
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to set fallback AP mode: %s",
                        esp_err_to_name(result));
               network_policy.fallback_ap_failed();
               return false;
          }
          result = esp_wifi_set_config(WIFI_IF_AP, &ap_config);
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to configure fallback AP: %s",
                        esp_err_to_name(result));
               network_policy.fallback_ap_failed();
               return false;
          }

          if (!wifi_started)
          {
               result = esp_wifi_start();
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to start fallback AP radio: %s",
                             esp_err_to_name(result));
                    network_policy.fallback_ap_failed();
                    return false;
               }
               wifi_started = true;
          }

          const EventBits_t bits = xEventGroupWaitBits(
              wifi_event_group, WIFI_AP_STARTED_BIT, pdFALSE, pdTRUE,
              pdMS_TO_TICKS(5000));
          if ((bits & WIFI_AP_STARTED_BIT) == 0)
          {
               ESP_LOGE(TAG, "Fallback AP start event was not observed");
               network_policy.fallback_ap_failed();
               return false;
          }

          result = esp_netif_dhcps_start(wifi_ap_netif);
          if (result != ESP_OK && result != ESP_ERR_ESP_NETIF_DHCP_ALREADY_STARTED)
          {
               ESP_LOGE(TAG, "Failed to start fallback AP DHCP server: %s",
                        esp_err_to_name(result));
               network_policy.fallback_ap_failed();
               return false;
          }

          network_policy.fallback_ap_started();
          ESP_LOGI(TAG, "Network state: %s",
                   local_controller::LocalController::state_name(network_policy.state()));
          ESP_LOGI(TAG, "Secured fallback AP '%s' active at http://192.168.4.1/",
                   ap_ssid);
          return true;
     }

     bool WebHoster::start_mDNS()
     {
          if (mdns_started)
          {
               return true;
          }

          esp_err_t result = mdns_init();
          if (result != ESP_OK && result != ESP_ERR_INVALID_STATE)
          {
               ESP_LOGE(TAG, "Failed to initialize mDNS: %s", esp_err_to_name(result));
               return false;
          }
          result = mdns_hostname_set(MDNS_HOSTNAME);
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to set mDNS hostname: %s", esp_err_to_name(result));
               return false;
          }
          result = mdns_instance_name_set(MDNS_INSTANCE_NAME);
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to set mDNS instance name: %s", esp_err_to_name(result));
               return false;
          }
          result = mdns_service_add(MDNS_INSTANCE_NAME, "_http", "_tcp",
                                    WEB_SERVER_PORT, nullptr, 0);
          if (result != ESP_OK && result != ESP_ERR_INVALID_STATE)
          {
               ESP_LOGE(TAG, "Failed to advertise HTTP via mDNS: %s",
                        esp_err_to_name(result));
               return false;
          }

          mdns_started = true;
          ESP_LOGI(TAG, "HTTP service advertised as http://%s.local/",
                   MDNS_HOSTNAME);
          return true;
     }

     // Private section
     // The tool used is IDF_ESP
     bool WebHoster::start_web_server()
     {
          if (web_server != nullptr)
          {
               ESP_LOGI(TAG, "Web server is already running");
               return true;
          }

          httpd_config_t config = HTTPD_DEFAULT_CONFIG();
          config.server_port = WEB_SERVER_PORT;
          config.max_uri_handlers = 10;
          esp_err_t result = httpd_start(&web_server, &config);
          if (result != ESP_OK)
          {
               web_server = nullptr;
               ESP_LOGE(TAG, "Failed to start web server: %s", esp_err_to_name(result));
               return false;
          }

          httpd_uri_t asset_uris[6] = {};
          asset_uris[0].uri = "/";
          asset_uris[0].method = HTTP_GET;
          asset_uris[0].handler = index_handler;
          asset_uris[0].user_ctx = &index_html_asset;
          asset_uris[1].uri = "/style.css";
          asset_uris[1].method = HTTP_GET;
          asset_uris[1].handler = index_handler;
          asset_uris[1].user_ctx = &style_css_asset;
          asset_uris[2].uri = "/app.js";
          asset_uris[2].method = HTTP_GET;
          asset_uris[2].handler = index_handler;
          asset_uris[2].user_ctx = &app_js_asset;
          asset_uris[3].uri = "/api/network/status";
          asset_uris[3].method = HTTP_GET;
          asset_uris[3].handler = network_status_handler;
          asset_uris[4].uri = "/api/hardware/state";
          asset_uris[4].method = HTTP_GET;
          asset_uris[4].handler = hardware_state_handler;
          asset_uris[5].uri = "/api/hardware/command";
          asset_uris[5].method = HTTP_POST;
          asset_uris[5].handler = hardware_command_handler;
          for (const httpd_uri_t &uri : asset_uris)
          {
               result = httpd_register_uri_handler(web_server, &uri);
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to register URI %s: %s", uri.uri,
                             esp_err_to_name(result));
                    httpd_stop(web_server);
                    web_server = nullptr;
                    return false;
               }
          }

          ESP_LOGI(TAG, "Web server started on port %u", static_cast<unsigned>(config.server_port));
          return true;
     }

     bool WebHoster::connect_to_house_network(const std::string &ssid,
                                              const std::string &password)
     {
          if (ssid.empty() || ssid.size() > sizeof(wifi_config_t{}.sta.ssid) ||
              password.size() >= sizeof(wifi_config_t{}.sta.password) ||
              (!password.empty() && password.size() < 8))
          {
               ESP_LOGE(TAG, "Wi-Fi SSID or password length is invalid");
               return false;
          }

          if (!initialize_network_stack(true))
          {
               return false;
          }

          wifi_config_t wifi_config = {};
          std::memcpy(wifi_config.sta.ssid, ssid.data(), ssid.size());
          std::memcpy(wifi_config.sta.password, password.data(), password.size());

          const wifi_mode_t wifi_mode =
              wifi_ap_netif == nullptr ? WIFI_MODE_STA : WIFI_MODE_APSTA;
          esp_err_t result = esp_wifi_set_mode(wifi_mode);
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to set Wi-Fi station mode: %s",
                        esp_err_to_name(result));
               return false;
          }

          result = esp_wifi_set_config(WIFI_IF_STA, &wifi_config);
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to configure Wi-Fi: %s", esp_err_to_name(result));
               return false;
          }

          if (!wifi_started)
          {
               result = esp_wifi_start();
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to start Wi-Fi: %s", esp_err_to_name(result));
                    return false;
               }
               wifi_started = true;
          }

          network_policy.station_connecting();
          ESP_LOGI(TAG, "Network state: %s",
                   local_controller::LocalController::state_name(network_policy.state()));
          xEventGroupClearBits(wifi_event_group,
                               WIFI_CONNECTED_BIT | WIFI_FAILED_BIT |
                                   WIFI_RECONNECT_BIT);
          result = esp_wifi_connect();
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to start Wi-Fi connection: %s",
                        esp_err_to_name(result));
               return false;
          }

          const EventBits_t bits = xEventGroupWaitBits(
              wifi_event_group, WIFI_CONNECTED_BIT | WIFI_FAILED_BIT, pdTRUE,
              pdFALSE, WIFI_CONNECT_TIMEOUT);
          if ((bits & WIFI_CONNECTED_BIT) != 0)
          {
               return true;
          }

          if ((bits & WIFI_FAILED_BIT) != 0)
          {
               ESP_LOGW(TAG, "Failed to connect to the configured Wi-Fi network");
          }
          else
          {
               ESP_LOGW(TAG, "Timed out waiting for Wi-Fi connection");
          }
          return false;
     }

     void WebHoster::reconnect_to_house_network_task(void *)
     {
          WebHoster hoster;
          std::size_t retry_index = 0;

          for (;;)
          {
               const EventBits_t events = xEventGroupWaitBits(
                   wifi_event_group, WIFI_RECONNECT_BIT, pdTRUE, pdFALSE,
                   portMAX_DELAY);
               if ((events & WIFI_RECONNECT_BIT) == 0)
               {
                    continue;
               }

               ESP_LOGW(TAG, "Station disconnected; preserving fallback access and scheduling reconnect");
               if (!hoster.start_fallback_ap())
               {
                    ESP_LOGE(TAG, "Fallback AP activation failed after station loss");
               }

               while (!network_policy.station_connected())
               {
                    const std::size_t delay_index =
                        std::min(retry_index, sizeof(WIFI_RECONNECT_DELAYS) /
                                                  sizeof(WIFI_RECONNECT_DELAYS[0]) - 1);
                    ESP_LOGI(TAG, "Station reconnect retry in %u seconds",
                             static_cast<unsigned>(WIFI_RECONNECT_DELAYS[delay_index] /
                                                   configTICK_RATE_HZ));
                    vTaskDelay(WIFI_RECONNECT_DELAYS[delay_index]);
                    if (retry_index + 1 < sizeof(WIFI_RECONNECT_DELAYS) /
                                              sizeof(WIFI_RECONNECT_DELAYS[0]))
                    {
                         ++retry_index;
                    }

                    if (hoster.connect_to_house_network(
                            house_wifi_ssid, house_wifi_password))
                    {
                         ESP_LOGI(TAG, "Station reconnected; fallback AP remains active");
                         retry_index = 0;
                    }
               }
          }
     }

     // Get wifi config
     bool WebHoster::get_wifi_config(std::string &ssid, std::string &password)
     {
          if (CONFIG_CONNECTIVITY_WIFI_SSID[0] == '\0')
          {
               ESP_LOGW(TAG, "Station SSID is not configured; starting secured fallback AP");
               return false;
          }

          ssid = CONFIG_CONNECTIVITY_WIFI_SSID;
          password = CONFIG_CONNECTIVITY_WIFI_PASSWORD;
          if (ssid.size() > sizeof(wifi_config_t{}.sta.ssid) ||
              password.size() >= sizeof(wifi_config_t{}.sta.password) ||
              (!password.empty() && password.size() < 8))
          {
               ESP_LOGE(TAG, "Station Wi-Fi credentials have invalid lengths; retry disabled");
               return false;
          }
          return true;
     }
}