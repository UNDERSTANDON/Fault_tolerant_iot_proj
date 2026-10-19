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
     void start_web_server()
     {
          // Implement the logic to start the web server here
          std::cout << "Starting web server..." << std::endl;
     }
}