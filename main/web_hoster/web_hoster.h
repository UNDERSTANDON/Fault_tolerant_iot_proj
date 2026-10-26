#ifndef WEB_HOSTER_H
#define WEB_HOSTER_H

#include <string>

namespace web_hoster
{
     class WebHoster
     {
     public:
          WebHoster();
          void start_local_network();
     private:
          void start_mDNS(const std::string &ssid, const std::string &password);
          bool connect_to_house_network();
          void start_web_server();
          bool get_wifi_config(std::string &ssid, std::string &password);
     };
}

#endif // WEB_HOSTER_H