#pragma once

#include <QHash>
#include <QObject>
#include <QPointer>
#include <QRectF>
#include <QTimer>
#include <QVariantList>
#include <QVariantMap>
#include <QWindow>

class MacScreenObj : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString name READ name NOTIFY changed)
    Q_PROPERTY(double x READ x NOTIFY changed)
    Q_PROPERTY(double y READ y NOTIFY changed)
    Q_PROPERTY(double width READ width NOTIFY changed)
    Q_PROPERTY(double height READ height NOTIFY changed)
    Q_PROPERTY(int topInset READ topInset NOTIFY changed)
    Q_PROPERTY(int bottomInset READ bottomInset NOTIFY changed)
    Q_PROPERTY(int leftInset READ leftInset NOTIFY changed)
    Q_PROPERTY(int rightInset READ rightInset NOTIFY changed)

public:
    explicit MacScreenObj(quint32 displayId, QObject *parent = nullptr);

    quint32 displayId() const { return m_displayId; }
    QString name() const { return m_name; }
    double x() const { return m_x; }
    double y() const { return m_y; }
    double width() const { return m_width; }
    double height() const { return m_height; }
    int topInset() const { return m_topInset; }
    int bottomInset() const { return m_bottomInset; }
    int leftInset() const { return m_leftInset; }
    int rightInset() const { return m_rightInset; }

    bool update(
        const QString &name,
        double x,
        double y,
        double w,
        double h,
        int topIn,
        int bottomIn,
        int leftIn,
        int rightIn
    );

signals:
    void changed();

private:
    quint32 m_displayId = 0;
    QString m_name;
    double m_x = 0;
    double m_y = 0;
    double m_width = 1440;
    double m_height = 900;
    int m_topInset = 25;
    int m_bottomInset = 0;
    int m_leftInset = 0;
    int m_rightInset = 0;
};

class MacPlatform : public QObject {
    Q_OBJECT
    Q_PROPERTY(QVariantList screens READ screens NOTIFY screensChanged)
    Q_PROPERTY(QVariantMap monitorInsets READ monitorInsets NOTIFY screensChanged)
    Q_PROPERTY(QVariantList visibleWindows READ visibleWindows NOTIFY windowsUpdated)
    Q_PROPERTY(QVariant activeWindowPos READ activeWindowPos NOTIFY activeWindowUpdated)
    Q_PROPERTY(QString activeWindowClass READ activeWindowClass NOTIFY activeWindowUpdated)
    Q_PROPERTY(QString activeWindowTitle READ activeWindowTitle NOTIFY activeWindowUpdated)
    Q_PROPERTY(bool isFullscreen READ isFullscreen NOTIFY windowsUpdated)
    Q_PROPERTY(int windowCount READ windowCount NOTIFY windowsUpdated)

    Q_PROPERTY(bool cursorKnown READ cursorKnown NOTIFY cursorChanged)
    Q_PROPERTY(double cursorX READ cursorX NOTIFY cursorChanged)
    Q_PROPERTY(double cursorY READ cursorY NOTIFY cursorChanged)
    Q_PROPERTY(double idleSeconds READ idleSeconds NOTIFY idleUpdated)

    Q_PROPERTY(double cpuUsage READ cpuUsage NOTIFY telemetryUpdated)
    Q_PROPERTY(double memUsage READ memUsage NOTIFY telemetryUpdated)
    Q_PROPERTY(double thermalWarmth READ thermalWarmth NOTIFY telemetryUpdated)
    Q_PROPERTY(bool hasBattery READ hasBattery NOTIFY powerUpdated)
    Q_PROPERTY(double batteryLevel READ batteryLevel NOTIFY powerUpdated)
    Q_PROPERTY(bool onBattery READ onBattery NOTIFY powerUpdated)
    Q_PROPERTY(bool isPluggedIn READ isPluggedIn NOTIFY powerUpdated)

    Q_PROPERTY(bool isPlaying READ isPlaying NOTIFY mediaUpdated)
    Q_PROPERTY(QString trackTitle READ trackTitle NOTIFY mediaUpdated)
    Q_PROPERTY(QString trackArtist READ trackArtist NOTIFY mediaUpdated)
    Q_PROPERTY(double audioVolume READ audioVolume NOTIFY audioUpdated)
    Q_PROPERTY(bool audioMuted READ audioMuted NOTIFY audioUpdated)
    Q_PROPERTY(bool micActive READ micActive NOTIFY audioUpdated)

public:
    static MacPlatform *instance();

    QVariantList screens() const { return m_screens; }
    QVariantMap monitorInsets() const { return m_monitorInsets; }
    QVariantList visibleWindows() const { return m_visibleWindows; }
    QVariant activeWindowPos() const { return m_activeWindowPos; }
    QString activeWindowClass() const { return m_activeWindowClass; }
    QString activeWindowTitle() const { return m_activeWindowTitle; }
    bool isFullscreen() const { return m_isFullscreen; }
    int windowCount() const { return m_windowCount; }

    bool cursorKnown() const { return m_cursorKnown; }
    double cursorX() const { return m_cursorX; }
    double cursorY() const { return m_cursorY; }
    double idleSeconds() const { return m_idleSeconds; }

    double cpuUsage() const { return m_cpuUsage; }
    double memUsage() const { return m_memUsage; }
    double thermalWarmth() const { return m_thermalWarmth; }
    bool hasBattery() const { return m_hasBattery; }
    double batteryLevel() const { return m_batteryLevel; }
    bool onBattery() const { return m_onBattery; }
    bool isPluggedIn() const { return m_isPluggedIn; }

    bool isPlaying() const { return m_isPlaying; }
    QString trackTitle() const { return m_trackTitle; }
    QString trackArtist() const { return m_trackArtist; }
    double audioVolume() const { return m_audioVolume; }
    bool audioMuted() const { return m_audioMuted; }
    bool micActive() const { return m_micActive; }

    Q_INVOKABLE void configureOverlayWindow(QWindow *win);
    Q_INVOKABLE void setOverlayInteractiveRects(QWindow *win, const QVariantList &rects, bool captureAll);
    Q_INVOKABLE void unregisterOverlayWindow(QWindow *win);
    Q_INVOKABLE void configureSanctuaryWindow(QWindow *win);
    Q_INVOKABLE void activateSanctuaryWindow(QWindow *win);
    Q_INVOKABLE void setPetsHiddenState(bool hidden);

    void notifySpaceChanged();
    void notifyAppActivated();
    void notifySystemWillSleep();
    void notifySystemDidWake();
    void handleCursorEvent();

    void triggerMenuOpenSanctuary();
    void triggerMenuToggleHidden();
    void triggerMenuSummon();
    void triggerMenuQuit();

    void refreshScreens();

signals:
    void screensChanged();
    void monitorConnected(const QString &screenName);
    void windowsUpdated();
    void activeWindowUpdated();
    void windowOpened(const QString &windowClass, const QString &title);
    void windowFocused(const QString &windowClass, const QString &title);
    void windowClosed(const QString &windowClass, double gx, double gy, double w, double h, const QString &address);
    void windowShifted(const QString &windowClass, double x, double y, double w, double h, const QString &address);
    void workspaceChanged();
    void workspaceCleared();

    void cursorChanged();
    void cursorMoved(double gx, double gy);
    void idleUpdated();

    void telemetryUpdated();
    void powerUpdated();
    void systemResumed(double sleptSec);

    void mediaUpdated();
    void audioUpdated();

    void openSanctuaryRequested();
    void toggleHiddenRequested();
    void summonRequested();
    void quitRequested();

private:
    explicit MacPlatform(QObject *parent = nullptr);
    ~MacPlatform() override;

    void applyOverlayStyle(QWindow *win);
    void updateMousePassthrough();
    void pollWindows();
    void pollIdleAndCursor();
    void pollTelemetryAndPower();
    void pollAudioAndMedia();
    void queryNowPlayingAsync();
    void setupNotificationsAndMonitors();
    void setupStatusBar();

    struct OverlayEntry {
        QPointer<QWindow> window;
        QList<QRectF> rects;
        bool captureAll = false;
        int lastIgnoresMouse = -1;
    };

    struct WinSnapshot {
        QString cls;
        QString title;
        QRectF rect;
    };

    QHash<quint32, MacScreenObj *> m_screenById;
    QVariantList m_screens;
    QVariantMap m_monitorInsets;
    bool m_screensBooted = false;
    double m_primaryScreenHeight = 900.0;

    QHash<QWindow *, OverlayEntry> m_overlays;

    QVariantList m_visibleWindows;
    QVariant m_activeWindowPos;
    QString m_activeWindowClass;
    QString m_activeWindowTitle;
    QString m_prevFocusedSig;
    bool m_isFullscreen = false;
    int m_windowCount = 0;
    int m_prevWindowCount = 0;
    bool m_windowsBooted = false;
    qint64 m_lastSpaceChangeMs = 0;
    QHash<QString, WinSnapshot> m_prevWindows;

    bool m_cursorKnown = false;
    double m_cursorX = 0;
    double m_cursorY = 0;
    double m_idleSeconds = 0;

    double m_cpuUsage = 0;
    double m_memUsage = 0;
    double m_thermalWarmth = 0;
    quint64 m_prevCpuTotal = 0;
    quint64 m_prevCpuIdle = 0;

    bool m_hasBattery = false;
    double m_batteryLevel = 1.0;
    bool m_onBattery = false;
    bool m_isPluggedIn = true;
    qint64 m_sleepBeganMs = 0;

    bool m_isPlaying = false;
    QString m_trackTitle;
    QString m_trackArtist;
    bool m_mediaQueryRunning = false;
    double m_audioVolume = 0.5;
    bool m_audioMuted = false;
    bool m_micActive = false;

    const void *m_globalMouseMonitor = nullptr;
    const void *m_localMouseMonitor = nullptr;
    const void *m_statusItem = nullptr;
    const void *m_toggleHideMenuItem = nullptr;
    const void *m_observerTarget = nullptr;
};

void registerMacPlatformTypes();
