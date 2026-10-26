#include "web_hoster.h"
#include <cstdio>
#include <cloud_controller.h>
#include <local_controller.h>
#include <iostream>
#include <cstddef>
#include <cstdint>
#include "cJSON.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "mdns.h"

extern "C"
{
     extern const uint8_t wifi_config_start[] asm("_binary_wifi_config_json_start");
     extern const uint8_t wifi_config_end[] asm("_binary_wifi_config_json_end");
}

namespace
{
     constexpr char TAG[] = "web_hoster";

     httpd_handle_t web_server = nullptr;

     esp_err_t index_handler(httpd_req_t *request)
     {
          httpd_resp_set_type(request, "text/html; charset=utf-8");
          httpd_resp_set_hdr(request, "Cache-Control", "no-store");

          std::FILE *file = std::fopen("./web/index.html", "rb");
          if (file == nullptr)
          {
               ESP_LOGE(TAG, "Failed to open ./web/index.html");
               httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR,
                                   "Unable to load index.html");
               return ESP_FAIL;
          }

          char buffer[1024];
          std::size_t bytes_read;
          esp_err_t result = ESP_OK;
          while ((bytes_read = std::fread(buffer, 1, sizeof(buffer), file)) > 0)
          {
               result = httpd_resp_send_chunk(request, buffer, bytes_read);
               if (result != ESP_OK)
               {
                    break;
               }
          }

          if (std::ferror(file))
          {
               ESP_LOGE(TAG, "Failed to read ./web/index.html");
               result = ESP_FAIL;
          }
          std::fclose(file);

          if (result == ESP_OK)
          {
               result = httpd_resp_send_chunk(request, nullptr, 0);
          }
          return result;
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

          bool connected = WebHoster::connect_to_house_network();
          for (int retry = 1; !connected && retry < 3; ++retry)
          {
               std::cout << "House network connection failed. Retry "
                         << (retry + 1) << " of 3..." << std::endl;
               connected = WebHoster::connect_to_house_network();
          }

          if (connected)
          {
               std::cout << "Connected to house network." << std::endl;
          }
          else
          {
               std::cout << "House network is down. Starting local network..." << std::endl;
               // Start the local-network fallback here.
          }

          // Web server is LAN regardless just to be safe
          WebHoster::start_mDNS(ssid, password);
          WebHoster::start_web_server();
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

          result = mdns_hostname_set("fault-tolerant-iot");
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to set mDNS hostname: %s", esp_err_to_name(result));
               return;
          }

          result = mdns_instance_name_set("Fault-tolerant IoT");
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to set mDNS instance name: %s", esp_err_to_name(result));
               return;
          }

          result = mdns_service_add("Fault-tolerant IoT", "_http", "_tcp", 80, nullptr, 0);
          if (result != ESP_OK && result != ESP_ERR_INVALID_STATE)
          {
               ESP_LOGE(TAG, "Failed to advertise HTTP service via mDNS: %s",
                        esp_err_to_name(result));
               return;
          }

          ESP_LOGI(TAG, "mDNS host available at http://fault-tolerant-iot.local");
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
          esp_err_t result = httpd_start(&web_server, &config);
          if (result != ESP_OK)
          {
               web_server = nullptr;
               ESP_LOGE(TAG, "Failed to start web server: %s", esp_err_to_name(result));
               return;
          }

          httpd_uri_t root_uri = {};
          root_uri.uri = "/";
          root_uri.method = HTTP_GET;
          root_uri.handler = index_handler;
          result = httpd_register_uri_handler(web_server, &root_uri);
          if (result != ESP_OK)
          {
               ESP_LOGE(TAG, "Failed to register root page: %s", esp_err_to_name(result));
               httpd_stop(web_server);
               web_server = nullptr;
               return;
          }

          ESP_LOGI(TAG, "Web server started on port %u", static_cast<unsigned>(config.server_port));
     }

     bool WebHoster::connect_to_house_network()
     {
          // Implement the logic to connect to the house network here
          std::cout << "Connecting to house network..." << std::endl;
          return true; // Return true if connected successfully, false otherwise
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