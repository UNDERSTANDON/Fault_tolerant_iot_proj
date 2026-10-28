#include "local_controller.h"

namespace local_controller {
     // Implementation of the local controller functions
     // Let's make an interface for the local controller
     // This means that the controller allows public and private methods
     // For the user to use and for the controller to use internally
     // For example, the user can use getStatus() to get all status of the devices
     // But we are also overload it to getStatus(device_name) to get specific device status

     // Events
     bool is_house_network_down(){
          // nameholder
          return false;
     }
}