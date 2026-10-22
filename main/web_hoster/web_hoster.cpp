#include "web_hoster.h"
#include <cstdio>
#include <cloud_controller.h>
#include <local_controller.h>
#include <iostream>
using namespace std;

// This is the web hoster module for the ESP32-S3
// The idea is instead of making an app for the UI/UX,
// we can just use a LAN website to manage and uses the IoT devices.
namespace web_hoster
{
     WebHoster::WebHoster()
     {
          // Constructor implementation
     }

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
}