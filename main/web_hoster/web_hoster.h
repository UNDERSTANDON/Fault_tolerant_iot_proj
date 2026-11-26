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
          bool initialize_network_stack(bool create_station_netif);
          bool start_fallback_ap();
          bool start_mDNS();
          bool connect_to_house_network(const std::string &ssid,
               const std::string &password);
          bool start_web_server();
          static void reconnect_to_house_network_task(void *parameter);
          bool get_wifi_config(std::string &ssid, std::string &password);
     };
}

#endif // WEB_HOSTER_H