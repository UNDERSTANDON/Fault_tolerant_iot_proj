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
using namespace std;

extern "C"
{
     extern const uint8_t wifi_config_start[] asm("_binary_wifi_config_json_start");
     extern const uint8_t wifi_config_end[] asm("_binary_wifi_config_json_end");
}

namespace
{
     constexpr char TAG[] = "web_hoster";
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

          if (WebHoster::connect_to_house_network())
          {
               std::cout << "Connected to house network." << std::endl;
          }
          else
          {
               std::cout << "House network is down. Starting local network..." << std::endl;
               // Implement the logic to start the local network here
          }
          WebHoster::start_web_server();
     }

     // Private section
     // The tool used is IDF_ESP
     void WebHoster::start_web_server()
     {
          // Implement the logic to start the web server here
          std::cout << "Starting web server..." << std::endl;
          // Start the web server here
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