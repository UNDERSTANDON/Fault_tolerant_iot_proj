#include "web_hoster.h"
#include <cstdio>
#include <cstring>
#include <cloud_controller.h>
#include <local_controller.h>
#include <iostream>
#include <cstddef>
#include <cstdint>
#include "cJSON.h"
#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "mdns.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "lwip/ip4_addr.h"

extern "C"
{
     extern const uint8_t wifi_config_start[] asm("_binary_wifi_config_json_start");
     extern const uint8_t wifi_config_end[] asm("_binary_wifi_config_json_end");
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
     constexpr TickType_t WIFI_CONNECT_TIMEOUT = pdMS_TO_TICKS(15000);
     constexpr TickType_t WIFI_RECONNECT_INTERVAL = pdMS_TO_TICKS(30000);

     httpd_handle_t web_server = nullptr;
     EventGroupHandle_t wifi_event_group = nullptr;
     esp_netif_t *wifi_station_netif = nullptr;
     esp_netif_t *wifi_ap_netif = nullptr;
     esp_event_handler_instance_t wifi_event_instance = nullptr;
     esp_event_handler_instance_t ip_event_instance = nullptr;
     bool wifi_driver_initialized = false;
     bool wifi_started = false;
     TaskHandle_t wifi_reconnect_task_handle = nullptr;
     std::string house_wifi_ssid;
     std::string house_wifi_password;

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
          if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED)
          {
               const auto *event =
                   static_cast<const wifi_event_sta_disconnected_t *>(event_data);
               ESP_LOGW(TAG, "Wi-Fi disconnected (reason %d)", event->reason);
               xEventGroupClearBits(wifi_event_group, WIFI_CONNECTED_BIT);
               xEventGroupSetBits(wifi_event_group, WIFI_FAILED_BIT);
          }
          else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP)
          {
               const auto *event =
                   static_cast<const ip_event_got_ip_t *>(event_data);
               ESP_LOGI(TAG, "Connected with IP address " IPSTR,
                        IP2STR(&event->ip_info.ip));
               xEventGroupClearBits(wifi_event_group, WIFI_FAILED_BIT);
               xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
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
          // Implement the logic to start the local network here
          std::cout << "Starting local network..." << std::endl;
          std::string ssid;
          std::string password;
          if (!get_wifi_config(ssid, password))
          {
               std::cout << "Failed to get Wi-Fi configuration. Cannot start local network." << std::endl;
               return;
          }

          house_wifi_ssid = ssid;
          house_wifi_password = password;

          bool connected = WebHoster::connect_to_house_network(ssid, password);
          for (int retry = 1; !connected && retry < 3; ++retry)
          {
               std::cout << "House network connection failed. Retry "
                         << (retry + 1) << " of 3..." << std::endl;
               connected = WebHoster::connect_to_house_network(ssid, password);
          }

          if (connected)
          {
               std::cout << "Connected to house network." << std::endl;
          }
          else
          {
               std::cout << "House network is down. Starting local fallback LAN host..." << std::endl;

               if (wifi_started)
               {
                    esp_err_t stop_result = esp_wifi_stop();
                    if (stop_result != ESP_OK)
                    {
                         ESP_LOGE(TAG, "Failed to stop Wi-Fi before AP fallback: %s",
                                  esp_err_to_name(stop_result));
                    }
                    wifi_started = false;
               }

               if (wifi_ap_netif == nullptr)
               {
                    wifi_ap_netif = esp_netif_create_default_wifi_ap();
                    if (wifi_ap_netif == nullptr)
                    {
                         ESP_LOGE(TAG, "Failed to create Wi-Fi AP interface");
                         return;
                    }
               }

               wifi_config_t ap_config = {};
               const char *ap_ssid = "ESP32_Fault_Tolerant_IoT_LAN";
               const char *ap_password = "ESP32_Winter2026!";

               std::strncpy(reinterpret_cast<char *>(ap_config.ap.ssid), ap_ssid,
                            sizeof(ap_config.ap.ssid) - 1);
               ap_config.ap.ssid_len = std::strlen(ap_ssid);
               std::strncpy(reinterpret_cast<char *>(ap_config.ap.password), ap_password,
                            sizeof(ap_config.ap.password) - 1);
               ap_config.ap.channel = 1;
               ap_config.ap.max_connection = 4;
               ap_config.ap.authmode = WIFI_AUTH_WPA2_PSK;

               esp_err_t result = esp_wifi_set_mode(WIFI_MODE_AP);
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to switch Wi-Fi to AP mode: %s",
                             esp_err_to_name(result));
                    return;
               }

               result = esp_wifi_set_config(WIFI_IF_AP, &ap_config);
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to configure fallback AP: %s",
                             esp_err_to_name(result));
                    return;
               }

               result = esp_wifi_start();
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to start fallback AP: %s",
                             esp_err_to_name(result));
                    return;
               }
               wifi_started = true;

               esp_netif_ip_info_t ap_ip_info = {};
               IP4_ADDR(&ap_ip_info.ip, 192, 168, 4, 1);
               IP4_ADDR(&ap_ip_info.gw, 192, 168, 4, 1);
               IP4_ADDR(&ap_ip_info.netmask, 255, 255, 255, 0);

               esp_netif_dhcps_stop(wifi_ap_netif);
               esp_netif_set_ip_info(wifi_ap_netif, &ap_ip_info);
               if (esp_netif_dhcps_start(wifi_ap_netif) != ESP_OK)
               {
                    ESP_LOGW(TAG, "Failed to start DHCP on fallback AP");
               }

               ESP_LOGI(TAG, "Fallback LAN host started with SSID '%s' at 192.168.4.1",
                        ap_ssid);
          }

          WebHoster::start_mDNS(ssid, password);
          WebHoster::start_web_server();

          if (wifi_reconnect_task_handle == nullptr)
          {
               const BaseType_t task_result = xTaskCreate(
                   WebHoster::reconnect_to_house_network_task,
                   "wifi_reconnect", 4096, nullptr, 5,
                   &wifi_reconnect_task_handle);
               if (task_result != pdPASS)
               {
                    wifi_reconnect_task_handle = nullptr;
                    ESP_LOGE(TAG, "Failed to create Wi-Fi reconnect task");
               }
          }
     }

     void WebHoster::start_mDNS(const std::string &ssid, const std::string &password)
     {
          // The mDNS responder advertises the device on the LAN and does not
          // need the Wi-Fi credentials.
          (void)ssid;
          (void)password;

          esp_err_t result = mdns_init();
          if (result != ESP_OK && result != ESP_ERR_INVALID_STATE)
          {
               ESP_LOGE(TAG, "Failed to initialize mDNS: %s", esp_err_to_name(result));
               return;
          }

          result = mdns_hostname_set(MDNS_HOSTNAME);
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to set mDNS hostname: %s", esp_err_to_name(result));
               return;
          }

          result = mdns_instance_name_set(MDNS_INSTANCE_NAME);
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to set mDNS instance name: %s", esp_err_to_name(result));
               return;
          }

          result = mdns_service_add(MDNS_INSTANCE_NAME, "_http", "_tcp",
                                    WEB_SERVER_PORT, nullptr, 0);
          if (result != ESP_OK && result != ESP_ERR_INVALID_STATE)
          {
               ESP_LOGE(TAG, "Failed to advertise HTTP service via mDNS: %s",
                        esp_err_to_name(result));
               return;
          }

          ESP_LOGI(TAG, "React web app available at http://%s.local/",
                   MDNS_HOSTNAME);
     }

     // Private section
     // The tool used is IDF_ESP
     void WebHoster::start_web_server()
     {
          if (web_server != nullptr)
          {
               ESP_LOGI(TAG, "Web server is already running");
               return;
          }

          httpd_config_t config = HTTPD_DEFAULT_CONFIG();
          config.server_port = WEB_SERVER_PORT;
          esp_err_t result = httpd_start(&web_server, &config);
          if (result != ESP_OK)
          {
               web_server = nullptr;
               ESP_LOGE(TAG, "Failed to start web server: %s", esp_err_to_name(result));
               return;
          }

          httpd_uri_t asset_uris[3] = {};
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
          for (const httpd_uri_t &uri : asset_uris)
          {
               result = httpd_register_uri_handler(web_server, &uri);
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to register URI %s: %s", uri.uri,
                             esp_err_to_name(result));
                    httpd_stop(web_server);
                    web_server = nullptr;
                    return;
               }
          }

          ESP_LOGI(TAG, "Web server started on port %u", static_cast<unsigned>(config.server_port));
     }

     bool WebHoster::connect_to_house_network(const std::string &ssid,
                                              const std::string &password)
     {
          std::cout << "Connecting to house network..." << std::endl;

          if (ssid.size() > sizeof(wifi_config_t{}.sta.ssid) ||
              password.size() > sizeof(wifi_config_t{}.sta.password))
          {
               ESP_LOGE(TAG, "Wi-Fi SSID or password exceeds the supported length");
               return false;
          }

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

          if (wifi_station_netif == nullptr)
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

          if (wifi_event_instance == nullptr)
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
          }
          if (ip_event_instance == nullptr)
          {
               result = esp_event_handler_instance_register(
                   IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, nullptr,
                   &ip_event_instance);
               if (result != ESP_OK)
               {
                    ESP_LOGE(TAG, "Failed to register IP event handler: %s",
                             esp_err_to_name(result));
                    return false;
               }
          }

          wifi_config_t wifi_config = {};
          std::memcpy(wifi_config.sta.ssid, ssid.data(), ssid.size());
          std::memcpy(wifi_config.sta.password, password.data(), password.size());

          const wifi_mode_t wifi_mode =
              wifi_ap_netif == nullptr ? WIFI_MODE_STA : WIFI_MODE_APSTA;
          result = esp_wifi_set_mode(wifi_mode);
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

          xEventGroupClearBits(wifi_event_group,
                               WIFI_CONNECTED_BIT | WIFI_FAILED_BIT);
          result = esp_wifi_connect();
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to start Wi-Fi connection: %s",
                        esp_err_to_name(result));
               return false;
          }

          const EventBits_t bits = xEventGroupWaitBits(
              wifi_event_group, WIFI_CONNECTED_BIT | WIFI_FAILED_BIT, pdFALSE,
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
          bool connected =
              (xEventGroupGetBits(wifi_event_group) & WIFI_CONNECTED_BIT) != 0;

          for (;;)
          {
               if (connected)
               {
                    xEventGroupWaitBits(wifi_event_group, WIFI_FAILED_BIT, pdTRUE,
                                        pdFALSE, portMAX_DELAY);
                    connected = false;
                    ESP_LOGW(TAG, "House Wi-Fi disconnected; attempting to reconnect");
               }
               else
               {
                    connected = hoster.connect_to_house_network(
                        house_wifi_ssid, house_wifi_password);
                    if (!connected)
                    {
                         vTaskDelay(WIFI_RECONNECT_INTERVAL);
                    }
                    else
                    {
                         ESP_LOGI(TAG, "Reconnected to house Wi-Fi");
                    }
               }
          }
     }

     // Get wifi config
     bool WebHoster::get_wifi_config(std::string &ssid, std::string &password)
     {
          const std::size_t config_size =
              reinterpret_cast<std::uintptr_t>(wifi_config_end) -
              reinterpret_cast<std::uintptr_t>(wifi_config_start);

          cJSON *root = cJSON_ParseWithLength(
              reinterpret_cast<const char *>(wifi_config_start), config_size);
          if (root == nullptr)
          {
               ESP_LOGE(TAG, "Embedded Wi-Fi configuration is not valid JSON");
               return false;
          }

          const cJSON *wifi_config = cJSON_GetObjectItemCaseSensitive(root, "wifi_config");
          if (!cJSON_IsObject(wifi_config))
          {
               ESP_LOGE(TAG, "Wi-Fi configuration must contain an object named 'wifi_config'");
               cJSON_Delete(root);
               return false;
          }

          const cJSON *ssid_item = cJSON_GetObjectItemCaseSensitive(wifi_config, "ssid");
          const cJSON *password_item = cJSON_GetObjectItemCaseSensitive(wifi_config, "password");
          if (!cJSON_IsString(ssid_item) || ssid_item->valuestring == nullptr ||
              ssid_item->valuestring[0] == '\0' ||
              !cJSON_IsString(password_item) || password_item->valuestring == nullptr)
          {
               ESP_LOGE(TAG, "Wi-Fi configuration must contain a non-empty SSID and a password string");
               cJSON_Delete(root);
               return false;
          }

          ssid = ssid_item->valuestring;
          password = password_item->valuestring;
          cJSON_Delete(root);
          return true;
     }
}