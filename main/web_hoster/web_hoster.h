#ifndef WEB_HOSTER_H
#define WEB_HOSTER_H

namespace web_hoster
{
     class WebHoster
     {
     public:
          WebHoster();
          void start_local_network();

     private:
          bool connect_to_house_network();
          void start_web_server();
     };
}

#endif // WEB_HOSTER_H