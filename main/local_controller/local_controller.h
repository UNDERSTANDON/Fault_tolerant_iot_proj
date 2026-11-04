#ifndef LOCAL_CONTROLLER_H
#define LOCAL_CONTROLLER_H

#include <string>

namespace local_controller
{
     class local_controller{
          public:
               local_controller();
               void getStatus_task();
               void getStatus_task(const std::string &device_name);
               void get_network_status_task(const std::string &network);
               
          private:

     };
}

#endif // LOCAL_CONTROLLER_H