#ifndef EVENT_NOTIFIER_H
#define EVENT_NOTIFIER_H

namespace event_notifier
{
    enum class Severity
    {
        warning,
        critical
    };

    struct Notification
    {
        Severity severity;
        // These strings are borrowed for the synchronous notify() call.
        const char *title;
        const char *message;
    };

    class NotificationSink
    {
    public:
        virtual ~NotificationSink() = default;
        // Return true only when the local sink accepted the notification.
        virtual bool notify_warning(const Notification &notification) = 0;
        virtual bool notify_critical(const Notification &notification) = 0;
    };

    class EventNotifier
    {
    public:
        explicit EventNotifier(NotificationSink &sink);
        // Dispatches synchronously; the sink must not block local control.
        bool notify(const Notification &notification) const;

    private:
        NotificationSink &sink_;
    };
}

#endif
