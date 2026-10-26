#include <cstdio>
#include <iostream>
#include "web_hoster.h"

// This is an embedded project for ESP32-S3
// The idea is to create a local-first fault-tolerant IoT system that
// have the ability to store logs and AI analysis on cloud.
// To reduce the cost of development, we will use the website for the user to connect to the local controller and manage the IoT devices.
// We can also implement a cloud controller to manage the local controllers and provide additional features such as AI analysis and data storage.
namespace main {
     // On init (which means when the ESP32-S3 is powered on), we will start the web server and the local network.
     // We will connect to the house network first as an access point, and then start the web server.
     // If the house network is down, we will start the local network and start the web server.
     void init()
     {
          std::cout << "Initializing the system..." << std::endl;
          web_hoster::WebHoster web_hoster;
          web_hoster.start_local_network();
     }
     
     extern "C" void app_main(void)
     {
          std::cout << "Hello, World!" << std::flush;
          std::cout << std::endl;
          init();
     }
}