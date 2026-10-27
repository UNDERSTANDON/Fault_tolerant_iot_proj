#ifndef LOCAL_CONTROLLER_H
#define LOCAL_CONTROLLER_H

#include <string>

namespace local_controller
{
     class local_controller{
          public:
               local_controller();
               void getStatus();
               void getStatus(const std::string &device_name);
          private:

     };
}

#endif // LOCAL_CONTROLLER_H