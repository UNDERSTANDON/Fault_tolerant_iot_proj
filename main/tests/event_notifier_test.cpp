#include "event_notifier.h"

#include <cassert>

namespace
{
    class TestSink final : public event_notifier::NotificationSink
    {
    public:
        bool notify_warning(const event_notifier::Notification &notification) override
        {
            ++warnings;
            last_title = notification.title;
            last_message = notification.message;
            return warning_accepted;
        }

        bool notify_critical(const event_notifier::Notification &notification) override
        {
            ++criticals;
            last_title = notification.title;
            last_message = notification.message;
            return critical_accepted;
        }

        int warnings = 0;
        int criticals = 0;
        bool warning_accepted = true;
        bool critical_accepted = true;
        const char *last_title = nullptr;
        const char *last_message = nullptr;
    };
}

int main()
{
    TestSink sink;
    const event_notifier::EventNotifier notifier(sink);

    assert(notifier.notify({event_notifier::Severity::warning, "Warning", "Test warning"}));
    assert(sink.warnings == 1);
    assert(sink.criticals == 0);
    assert(sink.last_title[0] == 'W');

    assert(notifier.notify({event_notifier::Severity::critical, "Critical", "Test critical"}));
    assert(sink.warnings == 1);
    assert(sink.criticals == 1);

    sink.warning_accepted = false;
    assert(!notifier.notify({event_notifier::Severity::warning, "Warning", "Sink rejected"}));

    assert(!notifier.notify({event_notifier::Severity::warning, "", "Missing title"}));
    assert(!notifier.notify({event_notifier::Severity::critical, "Critical", nullptr}));
    assert(!notifier.notify({static_cast<event_notifier::Severity>(99),
                             "Unknown", "Unknown severity"}));
    assert(sink.warnings == 2);
    assert(sink.criticals == 1);
    return 0;
}
