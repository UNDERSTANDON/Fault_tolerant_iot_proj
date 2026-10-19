#include <cstdio>
#include <iostream>
#include "web_hoster.h"
using namespace std;

// This is an embedded project for ESP32-S3
// The idea is to create a local-first fault-tolerant IoT system that
// have the ability to store logs and AI analysis on cloud.
// To reduce the cost of development, we will use the website for the user to connect to the local controller and manage the IoT devices.
// We can also implement a cloud controller to manage the local controllers and provide additional features such as AI analysis and data storage.
namespace main {
     extern "C" void app_main(void)
     {
          std::cout << "Hello, World!" << std::flush;
          std::cout << std::endl;
     }
}