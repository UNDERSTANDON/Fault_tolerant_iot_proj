#ifndef LOCAL_CONTROLLER_H
#define LOCAL_CONTROLLER_H

#include <atomic>

namespace local_controller
{
    enum class NetworkState
    {
        initializing,
        station_connecting,
        station_connected,
        fallback_ap_active,
        fallback_ap_reconnecting,
        station_ap_recovery,
        unavailable
    };

    class LocalController
    {
    public:
        NetworkState state() const;
        bool station_connected() const;
        bool fallback_ap_active() const;

        void station_connecting();
        void station_connected_event();
        void station_disconnected();
        void fallback_ap_started();
        void fallback_ap_failed();
        void services_unavailable();

        static const char *state_name(NetworkState state);

    private:
        void update_state();

        std::atomic<NetworkState> state_{NetworkState::initializing};
        std::atomic<bool> station_connected_{false};
        std::atomic<bool> fallback_ap_active_{false};
        std::atomic<bool> services_available_{true};
    };
}

#endif
