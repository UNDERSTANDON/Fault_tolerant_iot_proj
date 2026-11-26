#include <cstdio>
#include <iostream>
#include "web_hoster.h"

// This is an embedded project for ESP32-S3
// The idea is to create a local-first fault-tolerant IoT system that
// keep local event notification independent from optional cloud services.
// To reduce the cost of development, we will use the website for the user to connect to the local controller and manage the IoT devices.
// Cloud event storage and analysis belong in the local-server bridge.
namespace main {
     // On init (which means when the ESP32-S3 is powered on), we will start the web server and the local network.
     // We will connect to the house network first as an access point, and then start the web server.
     // If the house network is down, we will start the local network and start the web server.
     void init()
     {
          web_hoster::WebHoster web_hoster;
          web_hoster.start_local_network();
     }
     
     extern "C" void app_main(void)
     {
          init();
     }
}