#include "WinPlatform.h"

#include <windows.h>
#include <audiopolicy.h>
#include <dwmapi.h>
#include <endpointvolume.h>
#include <mmdeviceapi.h>
#include <objbase.h>
#include <psapi.h>
#include <shellapi.h>
#include <unknwn.h>

#ifdef QS_VPETS_HAS_WINRT_MEDIA
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.Control.h>
#endif

#include <QCoreApplication>
#include <QDateTime>
#include <QFileInfo>
#include <QGuiApplication>
#include <QMetaObject>
#include <QScreen>
#include <QtQml>

#include <algorithm>
#include <cmath>
#include <cwchar>
#include <iterator>
#include <thread>

#ifndef WS_EX_NOREDIRECTIONBITMAP
#define WS_EX_NOREDIRECTIONBITMAP 0x00200000L
#endif

#ifndef DWMWA_WINDOW_CORNER_PREFERENCE
#define DWMWA_WINDOW_CORNER_PREFERENCE 33
#endif

#ifndef DWMWCP_ROUND
#define DWMWCP_ROUND 2
#endif

namespace {

constexpr UINT kMsgTrayIcon = WM_APP + 101;
constexpr UINT kTrayIconId = 1;
constexpr UINT kMenuOpenSanctuary = 1001;
constexpr UINT kMenuSummon = 1002;
constexpr UINT kMenuToggleHidden = 1003;
constexpr UINT kMenuQuit = 1004;
constexpr int kResAppIconId = 101;

template <typename T>
class ComPtr {
public:
    ComPtr() = default;
    ~ComPtr() { reset(); }
    ComPtr(const ComPtr &) = delete;
    ComPtr &operator=(const ComPtr &) = delete;

    T **put() {
        reset();
        return &m_ptr;
    }
    T *get() const { return m_ptr; }
    T *operator->() const { return m_ptr; }
    explicit operator bool() const { return m_ptr != nullptr; }

    void reset() {
        if (m_ptr) {
            m_ptr->Release();
            m_ptr = nullptr;
        }
    }

private:
    T *m_ptr = nullptr;
};

struct PhysMonitorInfo {
    QString deviceName;
    RECT rect;
};

BOOL CALLBACK enumMonitorsProc(HMONITOR hMon, HDC, LPRECT, LPARAM lParam) {
    auto *list = reinterpret_cast<QList<PhysMonitorInfo> *>(lParam);
    MONITORINFOEXW mi {};
    mi.cbSize = sizeof(mi);
    if (GetMonitorInfoW(hMon, &mi)) {
        list->append(PhysMonitorInfo { QString::fromWCharArray(mi.szDevice), mi.rcMonitor });
    }
    return TRUE;
}

quint64 fileTimeToU64(const FILETIME &ft) {
    return (static_cast<quint64>(ft.dwHighDateTime) << 32) | static_cast<quint64>(ft.dwLowDateTime);
}

QString processNameForPid(DWORD pid) {
    if (pid == 0) return QString();
    HANDLE proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!proc) return QString();
    wchar_t buf[MAX_PATH * 2];
    DWORD len = static_cast<DWORD>(std::size(buf));
    QString out;
    if (QueryFullProcessImageNameW(proc, 0, buf, &len) && len > 0) {
        const QString fullPath = QString::fromWCharArray(buf, static_cast<int>(len));
        out = QFileInfo(fullPath).completeBaseName();
    }
    CloseHandle(proc);
    return out;
}

bool isCloakedWindow(HWND hwnd) {
    DWORD cloaked = 0;
    const HRESULT hr = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &cloaked, sizeof(cloaked));
    return SUCCEEDED(hr) && cloaked != 0;
}

bool isShellClass(const QString &cls) {
    return cls == QLatin1String("Progman")
        || cls == QLatin1String("WorkerW")
        || cls == QLatin1String("Shell_TrayWnd")
        || cls == QLatin1String("Shell_SecondaryTrayWnd")
        || cls == QLatin1String("NotifyIconOverflowWindow")
        || cls == QLatin1String("TopLevelWindowForOverflowXamlIsland")
        || cls == QLatin1String("Windows.UI.Core.CoreWindow")
        || cls == QLatin1String("ForegroundStaging")
        || cls == QLatin1String("EdgeUiInputTopWndClass");
}

struct EnumWinCtx {
    DWORD selfPid = 0;
    HWND foregroundHwnd = nullptr;
    QList<HWND> hwnds;
};

BOOL CALLBACK enumWindowsProc(HWND hwnd, LPARAM lParam) {
    auto *ctx = reinterpret_cast<EnumWinCtx *>(lParam);
    if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return TRUE;

    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    if (pid == 0 || pid == ctx->selfPid) return TRUE;

    const LONG_PTR exStyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if ((exStyle & WS_EX_TOOLWINDOW) && !(exStyle & WS_EX_APPWINDOW)) return TRUE;
    if (exStyle & WS_EX_NOACTIVATE) return TRUE;

    if (isCloakedWindow(hwnd)) return TRUE;

    wchar_t clsBuf[128] {};
    const int clsLen = GetClassNameW(hwnd, clsBuf, static_cast<int>(std::size(clsBuf)) - 1);
    if (clsLen > 0 && isShellClass(QString::fromWCharArray(clsBuf, clsLen))) return TRUE;

    ctx->hwnds.append(hwnd);
    return TRUE;
}

LRESULT CALLBACK trayHelperWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    auto *self = reinterpret_cast<WinPlatform *>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    if (self) {
        if (msg == kMsgTrayIcon) {
            const UINT ev = LOWORD(lParam);
            if (ev == WM_LBUTTONUP || ev == WM_LBUTTONDBLCLK) {
                self->triggerMenuOpenSanctuary();
                return 0;
            }
            if (ev == WM_RBUTTONUP || ev == WM_CONTEXTMENU) {
                self->showTrayContextMenu();
                return 0;
            }
        } else if (msg == WM_COMMAND) {
            switch (LOWORD(wParam)) {
            case kMenuOpenSanctuary:
                self->triggerMenuOpenSanctuary();
                return 0;
            case kMenuSummon:
                self->triggerMenuSummon();
                return 0;
            case kMenuToggleHidden:
                self->triggerMenuToggleHidden();
                return 0;
            case kMenuQuit:
                self->triggerMenuQuit();
                return 0;
            default:
                break;
            }
        } else if (msg == WM_POWERBROADCAST) {
            if (wParam == PBT_APMSUSPEND) {
                self->notifySystemWillSleep();
            } else if (wParam == PBT_APMRESUMEAUTOMATIC || wParam == PBT_APMRESUMESUSPEND) {
                self->notifySystemDidWake();
            }
            return TRUE;
        } else if (msg == WM_DISPLAYCHANGE) {
            QTimer::singleShot(150, self, &WinPlatform::refreshScreens);
            return 0;
        } else {
            static const UINT s_taskbarCreated = RegisterWindowMessageW(L"TaskbarCreated");
            if (s_taskbarCreated != 0 && msg == s_taskbarCreated) {
                self->addOrUpdateTrayIcon();
                return 0;
            }
        }
    }
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

} // namespace

// --- WinScreenObj ---

WinScreenObj::WinScreenObj(const QString &key, QObject *parent)
    : QObject(parent)
    , m_key(key) {}

bool WinScreenObj::update(
    const QString &name,
    double x,
    double y,
    double w,
    double h,
    int topIn,
    int bottomIn,
    int leftIn,
    int rightIn,
    double dpr,
    int pLeft,
    int pTop,
    int pRight,
    int pBottom
) {
    if (m_name == name && qFuzzyCompare(m_x + 1.0, x + 1.0) && qFuzzyCompare(m_y + 1.0, y + 1.0)
        && qFuzzyCompare(m_width, w) && qFuzzyCompare(m_height, h) && m_topInset == topIn
        && m_bottomInset == bottomIn && m_leftInset == leftIn && m_rightInset == rightIn
        && qFuzzyCompare(m_dpr, dpr) && m_physLeft == pLeft && m_physTop == pTop
        && m_physRight == pRight && m_physBottom == pBottom) {
        return false;
    }
    m_name = name;
    m_x = x;
    m_y = y;
    m_width = w;
    m_height = h;
    m_topInset = topIn;
    m_bottomInset = bottomIn;
    m_leftInset = leftIn;
    m_rightInset = rightIn;
    m_dpr = dpr > 0.1 ? dpr : 1.0;
    m_physLeft = pLeft;
    m_physTop = pTop;
    m_physRight = pRight;
    m_physBottom = pBottom;
    emit changed();
    return true;
}

// --- WinPlatform ---

WinPlatform *WinPlatform::instance() {
    static WinPlatform *s_inst = new WinPlatform(qApp);
    return s_inst;
}

WinPlatform::WinPlatform(QObject *parent)
    : QObject(parent) {
    refreshScreens();
    setupTrayAndHelperWindow();

    if (auto *gui = qobject_cast<QGuiApplication *>(QCoreApplication::instance())) {
        connect(gui, &QGuiApplication::screenAdded, this, [this](QScreen *scr) {
            if (scr) {
                connect(scr, &QScreen::geometryChanged, this, &WinPlatform::refreshScreens);
                connect(scr, &QScreen::availableGeometryChanged, this, &WinPlatform::refreshScreens);
            }
            refreshScreens();
        });
        connect(gui, &QGuiApplication::screenRemoved, this, [this](QScreen *) {
            refreshScreens();
        });
        for (QScreen *scr : gui->screens()) {
            connect(scr, &QScreen::geometryChanged, this, &WinPlatform::refreshScreens);
            connect(scr, &QScreen::availableGeometryChanged, this, &WinPlatform::refreshScreens);
        }
    }

    m_lastTelemetryWallMs = QDateTime::currentMSecsSinceEpoch();
    pollIdleAndCursor();
    pollWindows();
    pollTelemetryAndPower();
    pollAudioAndMedia();

    auto *fastTimer = new QTimer(this);
    fastTimer->setInterval(33);
    connect(fastTimer, &QTimer::timeout, this, &WinPlatform::pollIdleAndCursor);
    fastTimer->start();

    auto *winTimer = new QTimer(this);
    winTimer->setInterval(650);
    connect(winTimer, &QTimer::timeout, this, &WinPlatform::pollWindows);
    winTimer->start();

    auto *audioTimer = new QTimer(this);
    audioTimer->setInterval(2500);
    connect(audioTimer, &QTimer::timeout, this, &WinPlatform::pollAudioAndMedia);
    audioTimer->start();

    auto *sysTimer = new QTimer(this);
    sysTimer->setInterval(5000);
    connect(sysTimer, &QTimer::timeout, this, &WinPlatform::pollTelemetryAndPower);
    sysTimer->start();
}

WinPlatform::~WinPlatform() {
    cleanupTrayAndHelperWindow();
}

void WinPlatform::setupTrayAndHelperWindow() {
    const HINSTANCE hInst = GetModuleHandleW(nullptr);
    static const wchar_t *kClassName = L"QsVpetsTrayHelperClass";
    WNDCLASSEXW wc {};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = trayHelperWndProc;
    wc.hInstance = hInst;
    wc.lpszClassName = kClassName;
    RegisterClassExW(&wc);

    HWND hwnd = CreateWindowExW(
        0,
        kClassName,
        L"qs-vpets-helper",
        WS_OVERLAPPED,
        0,
        0,
        0,
        0,
        nullptr,
        nullptr,
        hInst,
        nullptr
    );
    if (!hwnd) return;
    SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(this));
    m_helperHwnd = hwnd;

    HICON hIcon = static_cast<HICON>(LoadImageW(
        hInst, MAKEINTRESOURCEW(kResAppIconId), IMAGE_ICON, GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), 0
    ));
    if (hIcon) {
        m_ownsTrayIcon = true;
    } else {
        hIcon = LoadIconW(nullptr, IDI_APPLICATION);
        m_ownsTrayIcon = false;
    }
    m_trayIconHandle = hIcon;
    addOrUpdateTrayIcon();
}

void WinPlatform::addOrUpdateTrayIcon() {
    if (!m_helperHwnd) return;
    NOTIFYICONDATAW nid {};
    nid.cbSize = sizeof(nid);
    nid.hWnd = static_cast<HWND>(m_helperHwnd);
    nid.uID = kTrayIconId;
    nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
    nid.uCallbackMessage = kMsgTrayIcon;
    nid.hIcon = static_cast<HICON>(m_trayIconHandle);
    wcsncpy_s(nid.szTip, L"Pok\u00e9mon Sanctuary", _TRUNCATE);
    if (!m_trayAdded) {
        m_trayAdded = Shell_NotifyIconW(NIM_ADD, &nid) != FALSE;
    } else {
        if (!Shell_NotifyIconW(NIM_MODIFY, &nid)) {
            m_trayAdded = Shell_NotifyIconW(NIM_ADD, &nid) != FALSE;
        }
    }
}

void WinPlatform::cleanupTrayAndHelperWindow() {
    if (m_helperHwnd) {
        if (m_trayAdded) {
            NOTIFYICONDATAW nid {};
            nid.cbSize = sizeof(nid);
            nid.hWnd = static_cast<HWND>(m_helperHwnd);
            nid.uID = kTrayIconId;
            Shell_NotifyIconW(NIM_DELETE, &nid);
            m_trayAdded = false;
        }
        DestroyWindow(static_cast<HWND>(m_helperHwnd));
        m_helperHwnd = nullptr;
    }
    if (m_trayIconHandle) {
        if (m_ownsTrayIcon) {
            DestroyIcon(static_cast<HICON>(m_trayIconHandle));
        }
        m_trayIconHandle = nullptr;
        m_ownsTrayIcon = false;
    }
}

void WinPlatform::showTrayContextMenu() {
    if (!m_helperHwnd) return;
    HMENU menu = CreatePopupMenu();
    if (!menu) return;

    AppendMenuW(menu, MF_STRING, kMenuOpenSanctuary, L"Open Pok\u00e9mon Sanctuary");
    AppendMenuW(menu, MF_STRING, kMenuSummon, L"Summon Companion");
    AppendMenuW(menu, MF_STRING, kMenuToggleHidden, m_petsHidden ? L"Show Desktop Pets" : L"Hide Desktop Pets");
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING, kMenuQuit, L"Quit Pok\u00e9mon Sanctuary");

    POINT pt {};
    GetCursorPos(&pt);
    HWND hwnd = static_cast<HWND>(m_helperHwnd);
    SetForegroundWindow(hwnd);
    TrackPopupMenu(menu, TPM_RIGHTBUTTON | TPM_BOTTOMALIGN | TPM_LEFTALIGN, pt.x, pt.y, 0, hwnd, nullptr);
    PostMessageW(hwnd, WM_NULL, 0, 0);
    DestroyMenu(menu);
}

void WinPlatform::refreshScreens() {
    QList<PhysMonitorInfo> physList;
    EnumDisplayMonitors(nullptr, nullptr, enumMonitorsProc, reinterpret_cast<LPARAM>(&physList));

    const QList<QScreen *> qtScreens = QGuiApplication::screens();
    QHash<QString, bool> seen;
    QVariantList nextList;
    QVariantMap nextInsets;
    QStringList newlyAdded;
    bool changedAny = false;

    int idx = 0;
    for (QScreen *scr : qtScreens) {
        if (!scr) continue;
        const QString rawName = scr->name();
        const QString key = !rawName.isEmpty() ? rawName : QStringLiteral("Display-%1").arg(++idx);
        seen.insert(key, true);

        const QRect geom = scr->geometry();
        const QRect avail = scr->availableGeometry();
        const double dpr = scr->devicePixelRatio() > 0.1 ? scr->devicePixelRatio() : 1.0;

        const int topIn = std::max(0, avail.top() - geom.top());
        const int bottomIn = std::max(0, geom.bottom() - avail.bottom());
        const int leftIn = std::max(0, avail.left() - geom.left());
        const int rightIn = std::max(0, geom.right() - avail.right());

        int pLeft = static_cast<int>(std::lround(geom.left() * dpr));
        int pTop = static_cast<int>(std::lround(geom.top() * dpr));
        int pRight = pLeft + static_cast<int>(std::lround(geom.width() * dpr));
        int pBottom = pTop + static_cast<int>(std::lround(geom.height() * dpr));

        for (const PhysMonitorInfo &pm : physList) {
            if (pm.deviceName.compare(rawName, Qt::CaseInsensitive) == 0) {
                pLeft = pm.rect.left;
                pTop = pm.rect.top;
                pRight = pm.rect.right;
                pBottom = pm.rect.bottom;
                break;
            }
        }

        WinScreenObj *obj = m_screenByKey.value(key, nullptr);
        if (!obj) {
            obj = new WinScreenObj(key, this);
            m_screenByKey.insert(key, obj);
            changedAny = true;
            if (m_screensBooted) newlyAdded.append(key);
        }
        if (obj->update(
                key,
                geom.x(),
                geom.y(),
                geom.width(),
                geom.height(),
                topIn,
                bottomIn,
                leftIn,
                rightIn,
                dpr,
                pLeft,
                pTop,
                pRight,
                pBottom
            )) {
            changedAny = true;
        }

        nextList.append(QVariant::fromValue<QObject *>(obj));
        QVariantMap im;
        im.insert(QStringLiteral("top"), topIn);
        im.insert(QStringLiteral("bottom"), bottomIn);
        im.insert(QStringLiteral("left"), leftIn);
        im.insert(QStringLiteral("right"), rightIn);
        nextInsets.insert(key, im);
    }

    const QList<QString> existingKeys = m_screenByKey.keys();
    for (const QString &k : existingKeys) {
        if (!seen.contains(k)) {
            WinScreenObj *dead = m_screenByKey.take(k);
            if (dead) dead->deleteLater();
            changedAny = true;
        }
    }

    if (nextList.size() != m_screens.size()) changedAny = true;
    m_screens = nextList;
    m_monitorInsets = nextInsets;
    m_screensBooted = true;

    if (changedAny) {
        emit screensChanged();
    }
    for (const QString &addedName : newlyAdded) {
        emit monitorConnected(addedName);
    }
}

QPointF WinPlatform::physToLogical(int px, int py) const {
    WinScreenObj *best = nullptr;
    double bestDist = 1e18;
    for (const QVariant &sv : m_screens) {
        auto *so = qobject_cast<WinScreenObj *>(sv.value<QObject *>());
        if (!so) continue;
        if (px >= so->physLeft() && px < so->physRight() && py >= so->physTop() && py < so->physBottom()) {
            best = so;
            break;
        }
        const double cx = std::clamp(static_cast<double>(px), static_cast<double>(so->physLeft()), static_cast<double>(so->physRight()));
        const double cy = std::clamp(static_cast<double>(py), static_cast<double>(so->physTop()), static_cast<double>(so->physBottom()));
        const double d = std::hypot(px - cx, py - cy);
        if (d < bestDist) {
            bestDist = d;
            best = so;
        }
    }
    if (!best) return QPointF(px, py);
    return QPointF(
        best->x() + (static_cast<double>(px - best->physLeft()) / best->dpr()),
        best->y() + (static_cast<double>(py - best->physTop()) / best->dpr())
    );
}

QRectF WinPlatform::physRectToLogical(int left, int top, int right, int bottom) const {
    const int cx = (left + right) / 2;
    const int cy = (top + bottom) / 2;
    WinScreenObj *best = nullptr;
    double bestDist = 1e18;
    for (const QVariant &sv : m_screens) {
        auto *so = qobject_cast<WinScreenObj *>(sv.value<QObject *>());
        if (!so) continue;
        if (cx >= so->physLeft() && cx < so->physRight() && cy >= so->physTop() && cy < so->physBottom()) {
            best = so;
            break;
        }
        const double clx = std::clamp(static_cast<double>(cx), static_cast<double>(so->physLeft()), static_cast<double>(so->physRight()));
        const double cly = std::clamp(static_cast<double>(cy), static_cast<double>(so->physTop()), static_cast<double>(so->physBottom()));
        const double d = std::hypot(cx - clx, cy - cly);
        if (d < bestDist) {
            bestDist = d;
            best = so;
        }
    }
    if (!best) {
        return QRectF(left, top, std::max(0, right - left), std::max(0, bottom - top));
    }
    const double dpr = best->dpr();
    const double lx = best->x() + static_cast<double>(left - best->physLeft()) / dpr;
    const double ly = best->y() + static_cast<double>(top - best->physTop()) / dpr;
    const double lw = static_cast<double>(std::max(0, right - left)) / dpr;
    const double lh = static_cast<double>(std::max(0, bottom - top)) / dpr;
    return QRectF(lx, ly, lw, lh);
}

void WinPlatform::applyOverlayStyle(QWindow *win) {
    if (!win) return;
    HWND hwnd = reinterpret_cast<HWND>(win->winId());
    if (!hwnd) return;

    LONG_PTR ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    ex |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST;
    ex &= ~WS_EX_APPWINDOW;
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
    SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_FRAMECHANGED
    );
}

void WinPlatform::configureOverlayWindow(QWindow *win) {
    if (!win) return;
    if (!m_overlays.contains(win)) {
        OverlayEntry entry;
        entry.window = win;
        m_overlays.insert(win, entry);
        connect(win, &QObject::destroyed, this, [this, win]() { m_overlays.remove(win); });
    }
    applyOverlayStyle(win);
    updateMousePassthrough();
}

void WinPlatform::unregisterOverlayWindow(QWindow *win) {
    if (!win) return;
    m_overlays.remove(win);
}

void WinPlatform::setOverlayInteractiveRects(QWindow *win, const QVariantList &rects, bool captureAll) {
    if (!win) return;
    auto it = m_overlays.find(win);
    if (it == m_overlays.end()) {
        OverlayEntry entry;
        entry.window = win;
        it = m_overlays.insert(win, entry);
        connect(win, &QObject::destroyed, this, [this, win]() { m_overlays.remove(win); });
    }
    QList<QRectF> parsed;
    parsed.reserve(rects.size());
    for (const QVariant &v : rects) {
        const QVariantMap m = v.toMap();
        const double x = m.value(QStringLiteral("x")).toDouble();
        const double y = m.value(QStringLiteral("y")).toDouble();
        const double w = m.value(QStringLiteral("w")).toDouble();
        const double h = m.value(QStringLiteral("h")).toDouble();
        if (w > 0.0 && h > 0.0) {
            parsed.append(QRectF(x, y, w, h));
        }
    }
    it.value().rects = parsed;
    it.value().captureAll = captureAll;
    updateMousePassthrough();
}

void WinPlatform::configureSanctuaryWindow(QWindow *win) {
    if (!win) return;
    HWND hwnd = reinterpret_cast<HWND>(win->winId());
    if (!hwnd) return;
    const DWORD cornerPref = DWMWCP_ROUND;
    DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &cornerPref, sizeof(cornerPref));
}

void WinPlatform::activateSanctuaryWindow(QWindow *win) {
    if (!win) return;
    win->show();
    win->raise();
    win->requestActivate();
    HWND hwnd = reinterpret_cast<HWND>(win->winId());
    if (hwnd) {
        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
        BringWindowToTop(hwnd);
    }
}

void WinPlatform::setPetsHiddenState(bool hidden) {
    m_petsHidden = hidden;
}

void WinPlatform::updateMousePassthrough() {
    if (m_overlays.isEmpty() || !m_cursorKnown) return;

    const bool anyButtonDown = ((GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0)
                            || ((GetAsyncKeyState(VK_RBUTTON) & 0x8000) != 0);
    QWindow *capturingWin = nullptr;
    for (auto it = m_overlays.begin(); it != m_overlays.end(); ++it) {
        if (it.value().captureAll && !anyButtonDown) {
            it.value().captureAll = false;
        }
        if (!capturingWin && it.value().window && it.value().window->isVisible() && it.value().captureAll) {
            capturingWin = it.value().window;
        }
    }

    for (auto it = m_overlays.begin(); it != m_overlays.end(); ++it) {
        QWindow *win = it.value().window;
        if (!win) continue;
        HWND hwnd = reinterpret_cast<HWND>(win->winId());
        if (!hwnd) continue;

        bool shouldIgnore = true;
        if (win->isVisible()) {
            if (capturingWin) {
                shouldIgnore = (win != capturingWin);
            } else {
                const double lx = m_cursorX - win->x();
                const double ly = m_cursorY - win->y();
                for (const QRectF &r : it.value().rects) {
                    if (r.contains(lx, ly)) {
                        shouldIgnore = false;
                        break;
                    }
                }
            }
        }

        const int nextFlag = shouldIgnore ? 1 : 0;
        if (it.value().lastIgnoresMouse != nextFlag) {
            it.value().lastIgnoresMouse = nextFlag;
            LONG_PTR ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            const bool isDirectComp = (ex & WS_EX_NOREDIRECTIONBITMAP) != 0;
            if (shouldIgnore) {
                if (!isDirectComp && !(ex & WS_EX_LAYERED)) {
                    ex |= WS_EX_LAYERED;
                    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
                    if (!it.value().layeredAlphaApplied) {
                        SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
                        it.value().layeredAlphaApplied = true;
                    }
                }
                ex |= WS_EX_TRANSPARENT;
            } else {
                ex &= ~WS_EX_TRANSPARENT;
            }
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
        }
    }
}

void WinPlatform::pollIdleAndCursor() {
    POINT pt {};
    if (GetCursorPos(&pt)) {
        const QPointF logical = physToLogical(pt.x, pt.y);
        const double gx = logical.x();
        const double gy = logical.y();
        const bool moved = !m_cursorKnown || std::hypot(gx - m_cursorX, gy - m_cursorY) >= 0.5;
        m_cursorX = gx;
        m_cursorY = gy;
        m_cursorKnown = true;
        updateMousePassthrough();
        if (moved) {
            emit cursorChanged();
            emit cursorMoved(gx, gy);
        }
    }

    LASTINPUTINFO lii {};
    lii.cbSize = sizeof(lii);
    if (GetLastInputInfo(&lii)) {
        const quint32 elapsedMs = static_cast<quint32>(GetTickCount() - lii.dwTime);
        const double idle = static_cast<double>(elapsedMs) / 1000.0;
        if (std::isfinite(idle) && idle >= 0.0 && std::abs(idle - m_idleSeconds) >= 0.2) {
            m_idleSeconds = idle;
            emit idleUpdated();
        }
    }
}

void WinPlatform::notifySystemWillSleep() {
    m_sleepBeganMs = QDateTime::currentMSecsSinceEpoch();
}

void WinPlatform::notifySystemDidWake() {
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    if (m_sleepBeganMs > 0 && now > m_sleepBeganMs) {
        const double sleptSec = static_cast<double>(now - m_sleepBeganMs) / 1000.0;
        m_sleepBeganMs = 0;
        if (sleptSec >= 10.0) {
            emit systemResumed(sleptSec);
        }
    }
    refreshScreens();
    pollWindows();
    pollTelemetryAndPower();
}

void WinPlatform::pollWindows() {
    EnumWinCtx ctx;
    ctx.selfPid = GetCurrentProcessId();
    ctx.foregroundHwnd = GetForegroundWindow();
    EnumWindows(enumWindowsProc, reinterpret_cast<LPARAM>(&ctx));

    bool shellFullscreen = false;
    QUERY_USER_NOTIFICATION_STATE quns = QUNS_ACCEPTS_NOTIFICATIONS;
    if (SUCCEEDED(SHQueryUserNotificationState(&quns))) {
        if (quns == QUNS_RUNNING_D3D_FULL_SCREEN || quns == QUNS_BUSY) {
            shellFullscreen = true;
        }
    }

    QVariantList nextWins;
    QHash<QString, WinSnapshot> nextMap;
    QList<QRectF> frontOpaqueRects;

    QVariant nextActivePos;
    QString nextActiveCls;
    QString nextActiveTitle;
    bool nextFullscreen = shellFullscreen;
    bool foundActive = false;

    for (HWND hwnd : ctx.hwnds) {
        RECT physRc {};
        const HRESULT dwmHr = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, &physRc, sizeof(physRc));
        if (FAILED(dwmHr)) {
            if (!GetWindowRect(hwnd, &physRc)) continue;
        }

        const QRectF qrect = physRectToLogical(physRc.left, physRc.top, physRc.right, physRc.bottom);
        const double wx = qrect.x();
        const double wy = qrect.y();
        const double ww = qrect.width();
        const double wh = qrect.height();
        if (ww < 160.0 || wh < 90.0) continue;

        DWORD pid = 0;
        GetWindowThreadProcessId(hwnd, &pid);
        QString cls = processNameForPid(pid);

        wchar_t titleBuf[256] {};
        const int tLen = GetWindowTextW(hwnd, titleBuf, static_cast<int>(std::size(titleBuf)) - 1);
        QString title = tLen > 0 ? QString::fromWCharArray(titleBuf, tLen) : cls;
        if (cls.isEmpty()) cls = title;
        if (cls.isEmpty()) continue;

        const QString addr = QStringLiteral("0x%1").arg(reinterpret_cast<quintptr>(hwnd), 0, 16);

        const double cx = wx + ww * 0.5;
        const double cy = wy + wh * 0.5;
        WinScreenObj *winScreen = nullptr;
        for (const QVariant &sv : m_screens) {
            auto *so = qobject_cast<WinScreenObj *>(sv.value<QObject *>());
            if (so && cx >= so->x() && cx < so->x() + so->width() && cy >= so->y() && cy < so->y() + so->height()) {
                winScreen = so;
                break;
            }
        }

        bool isTrueFullscreen = false;
        bool isFlushToTop = false;
        if (winScreen) {
            isTrueFullscreen = (wx <= winScreen->x() + 2.0 && wy <= winScreen->y() + 2.0
                                && ww >= winScreen->width() - 4.0 && wh >= winScreen->height() - 4.0);
            isFlushToTop = (wy <= winScreen->y() + winScreen->topInset() + 28.0);
        }

        bool ledgeOccluded = false;
        const QPointF pMid(wx + ww * 0.5, wy + 8.0);
        const QPointF pLeft(wx + ww * 0.25, wy + 8.0);
        const QPointF pRight(wx + ww * 0.75, wy + 8.0);
        int coveredPts = 0;
        for (const QRectF &front : frontOpaqueRects) {
            if (front.contains(pMid)) coveredPts++;
            if (front.contains(pLeft)) coveredPts++;
            if (front.contains(pRight)) coveredPts++;
        }
        if (coveredPts >= 3) ledgeOccluded = true;

        frontOpaqueRects.append(qrect);
        nextMap.insert(addr, WinSnapshot { cls, title, qrect });

        const bool isFocusedWin = !foundActive && (hwnd == ctx.foregroundHwnd);
        if (isFocusedWin) {
            foundActive = true;
            QVariantMap posMap;
            posMap.insert(QStringLiteral("address"), addr);
            posMap.insert(QStringLiteral("x"), wx);
            posMap.insert(QStringLiteral("y"), wy);
            posMap.insert(QStringLiteral("w"), ww);
            posMap.insert(QStringLiteral("h"), wh);
            nextActivePos = posMap;
            nextActiveCls = cls;
            nextActiveTitle = title;
            if (isTrueFullscreen) nextFullscreen = true;
        }
        if (isTrueFullscreen) nextFullscreen = true;

        if (!ledgeOccluded) {
            QVariantMap wm;
            wm.insert(QStringLiteral("address"), addr);
            wm.insert(QStringLiteral("cls"), cls);
            wm.insert(QStringLiteral("title"), title);
            wm.insert(QStringLiteral("x"), wx);
            wm.insert(QStringLiteral("y"), wy);
            wm.insert(QStringLiteral("w"), ww);
            wm.insert(QStringLiteral("h"), wh);
            wm.insert(QStringLiteral("focused"), isFocusedWin);
            wm.insert(QStringLiteral("fullscreen"), isTrueFullscreen || isFlushToTop);
            wm.insert(QStringLiteral("trueFullscreen"), isTrueFullscreen);
            nextWins.append(wm);
        }
    }

    const int nextCount = nextMap.size();
    if (m_windowsBooted) {
        for (auto it = nextMap.constBegin(); it != nextMap.constEnd(); ++it) {
            if (!m_prevWindows.contains(it.key())) {
                emit windowOpened(it.value().cls, it.value().title);
            } else {
                const QRectF &oldR = m_prevWindows.value(it.key()).rect;
                const QRectF &newR = it.value().rect;
                if (std::abs(newR.x() - oldR.x()) >= 42.0 || std::abs(newR.y() - oldR.y()) >= 42.0
                    || std::abs(newR.width() - oldR.width()) >= 42.0 || std::abs(newR.height() - oldR.height()) >= 42.0) {
                    emit windowShifted(it.value().cls, newR.x(), newR.y(), newR.width(), newR.height(), it.key());
                }
            }
        }
        for (auto it = m_prevWindows.constBegin(); it != m_prevWindows.constEnd(); ++it) {
            if (!nextMap.contains(it.key())) {
                const QRectF &r = it.value().rect;
                emit windowClosed(it.value().cls, r.x() + r.width() * 0.5, r.y() + r.height() * 0.5, r.width(), r.height(), it.key());
            }
        }
        if (m_prevWindowCount > 0 && nextCount == 0) {
            emit workspaceCleared();
        }
    }

    m_prevWindows = nextMap;
    m_prevWindowCount = nextCount;
    m_windowsBooted = true;

    m_visibleWindows = nextWins;
    m_isFullscreen = nextFullscreen;
    m_windowCount = nextCount;
    emit windowsUpdated();

    const QString focusSig = nextActiveCls + QStringLiteral("|") + nextActiveTitle;
    const bool activeChanged = (nextActivePos != m_activeWindowPos) || (focusSig != m_prevFocusedSig);
    m_activeWindowPos = nextActivePos;
    m_activeWindowClass = nextActiveCls;
    m_activeWindowTitle = nextActiveTitle;
    if (activeChanged) {
        emit activeWindowUpdated();
    }
    if (focusSig != m_prevFocusedSig && !nextActiveCls.isEmpty()) {
        m_prevFocusedSig = focusSig;
        emit windowFocused(nextActiveCls, nextActiveTitle);
    }
}

void WinPlatform::pollTelemetryAndPower() {
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    if (m_lastTelemetryWallMs > 0 && (now - m_lastTelemetryWallMs) > 35000 && m_sleepBeganMs == 0) {
        const double sleptSec = static_cast<double>(now - m_lastTelemetryWallMs) / 1000.0;
        emit systemResumed(sleptSec);
    }
    m_lastTelemetryWallMs = now;

    // 1. CPU usage via GetSystemTimes delta
    FILETIME ftIdle {}, ftKernel {}, ftUser {};
    if (GetSystemTimes(&ftIdle, &ftKernel, &ftUser)) {
        const quint64 idle = fileTimeToU64(ftIdle);
        const quint64 kernel = fileTimeToU64(ftKernel);
        const quint64 user = fileTimeToU64(ftUser);
        if (m_prevCpuKernel > 0 || m_prevCpuUser > 0) {
            const quint64 dIdle = idle - m_prevCpuIdle;
            const quint64 dKernel = kernel - m_prevCpuKernel;
            const quint64 dUser = user - m_prevCpuUser;
            const quint64 dTotal = dKernel + dUser;
            if (dTotal > 0) {
                const double busy = static_cast<double>(dTotal > dIdle ? (dTotal - dIdle) : 0) / static_cast<double>(dTotal);
                m_cpuUsage = std::clamp(busy, 0.0, 1.0);
            }
        }
        m_prevCpuIdle = idle;
        m_prevCpuKernel = kernel;
        m_prevCpuUser = user;
    }

    // 2. Memory usage via GlobalMemoryStatusEx
    MEMORYSTATUSEX mem {};
    mem.dwLength = sizeof(mem);
    if (GlobalMemoryStatusEx(&mem)) {
        m_memUsage = std::clamp(static_cast<double>(mem.dwMemoryLoad) / 100.0, 0.0, 1.0);
    }

    // 3. Thermal warmth estimate from sustained CPU/memory activity
    const double targetWarmth = std::clamp((m_cpuUsage - 0.15) * 1.1 + m_memUsage * 0.15, 0.0, 1.0);
    m_thermalWarmth = m_thermalWarmth * 0.72 + targetWarmth * 0.28;
    emit telemetryUpdated();

    // 4. Battery & AC power state via GetSystemPowerStatus
    SYSTEM_POWER_STATUS sps {};
    if (GetSystemPowerStatus(&sps)) {
        const bool nextHasBatt = (sps.BatteryFlag != 128 && sps.BatteryFlag != 255);
        double nextLevel = 1.0;
        if (nextHasBatt && sps.BatteryLifePercent <= 100) {
            nextLevel = std::clamp(static_cast<double>(sps.BatteryLifePercent) / 100.0, 0.0, 1.0);
        }
        const bool nextPlugged = (sps.ACLineStatus != 0);
        const bool nextOnBatt = nextHasBatt && !nextPlugged;

        if (nextHasBatt != m_hasBattery || std::abs(nextLevel - m_batteryLevel) >= 0.01
            || nextPlugged != m_isPluggedIn || nextOnBatt != m_onBattery) {
            m_hasBattery = nextHasBatt;
            m_batteryLevel = nextLevel;
            m_isPluggedIn = nextPlugged;
            m_onBattery = nextOnBatt;
            emit powerUpdated();
        }
    }
}

void WinPlatform::pollAudioAndMedia() {
    double nextVol = m_audioVolume;
    bool nextMuted = m_audioMuted;
    bool nextMic = false;

    ComPtr<IMMDeviceEnumerator> enumerator;
    if (SUCCEEDED(CoCreateInstance(
            __uuidof(MMDeviceEnumerator),
            nullptr,
            CLSCTX_ALL,
            __uuidof(IMMDeviceEnumerator),
            reinterpret_cast<void **>(enumerator.put())
        ))
        && enumerator) {
        ComPtr<IMMDevice> renderDev;
        if (SUCCEEDED(enumerator->GetDefaultAudioEndpoint(eRender, eMultimedia, renderDev.put())) && renderDev) {
            ComPtr<IAudioEndpointVolume> epVol;
            if (SUCCEEDED(renderDev->Activate(
                    __uuidof(IAudioEndpointVolume), CLSCTX_ALL, nullptr, reinterpret_cast<void **>(epVol.put())
                ))
                && epVol) {
                float scalar = 0.5f;
                if (SUCCEEDED(epVol->GetMasterVolumeLevelScalar(&scalar))) {
                    nextVol = std::clamp(static_cast<double>(scalar), 0.0, 1.0);
                }
                BOOL muted = FALSE;
                if (SUCCEEDED(epVol->GetMute(&muted))) {
                    nextMuted = (muted != FALSE);
                }
            }
        }

        ComPtr<IMMDevice> capDev;
        if (SUCCEEDED(enumerator->GetDefaultAudioEndpoint(eCapture, eCommunications, capDev.put())) && capDev) {
            ComPtr<IAudioSessionManager2> mgr;
            if (SUCCEEDED(capDev->Activate(
                    __uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr, reinterpret_cast<void **>(mgr.put())
                ))
                && mgr) {
                ComPtr<IAudioSessionEnumerator> sessEnum;
                if (SUCCEEDED(mgr->GetSessionEnumerator(sessEnum.put())) && sessEnum) {
                    int count = 0;
                    if (SUCCEEDED(sessEnum->GetCount(&count))) {
                        for (int i = 0; i < count; ++i) {
                            ComPtr<IAudioSessionControl> ctrl;
                            if (SUCCEEDED(sessEnum->GetSession(i, ctrl.put())) && ctrl) {
                                AudioSessionState st = AudioSessionStateInactive;
                                if (SUCCEEDED(ctrl->GetState(&st)) && st == AudioSessionStateActive) {
                                    nextMic = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (std::abs(nextVol - m_audioVolume) >= 0.01 || nextMuted != m_audioMuted || nextMic != m_micActive) {
        m_audioVolume = nextVol;
        m_audioMuted = nextMuted;
        m_micActive = nextMic;
        emit audioUpdated();
    }

    queryNowPlayingAsync();
}

void WinPlatform::queryNowPlayingAsync() {
#ifdef QS_VPETS_HAS_WINRT_MEDIA
    if (m_mediaQueryRunning) return;
    m_mediaQueryRunning = true;
    QPointer<WinPlatform> self(this);
    std::thread([self]() {
        bool playing = false;
        QString title;
        QString artist;
        bool inited = false;
        try {
            winrt::init_apartment(winrt::apartment_type::multi_threaded);
            inited = true;
            auto mgr = winrt::Windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager::RequestAsync().get();
            if (mgr) {
                auto session = mgr.GetCurrentSession();
                if (session) {
                    auto pb = session.GetPlaybackInfo();
                    if (pb && pb.PlaybackStatus()
                        == winrt::Windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing) {
                        playing = true;
                    }
                    if (playing) {
                        auto props = session.TryGetMediaPropertiesAsync().get();
                        if (props) {
                            const auto t = props.Title();
                            const auto a = props.Artist();
                            title = QString::fromWCharArray(t.c_str(), static_cast<int>(t.size()));
                            artist = QString::fromWCharArray(a.c_str(), static_cast<int>(a.size()));
                        }
                    }
                }
            }
        } catch (...) {
            playing = false;
        }
        if (inited) {
            try {
                winrt::uninit_apartment();
            } catch (...) {}
        }

        if (self) {
            QMetaObject::invokeMethod(
                self,
                [self, playing, title, artist]() {
                    if (!self) return;
                    self->m_mediaQueryRunning = false;
                    if (playing != self->m_isPlaying || title != self->m_trackTitle || artist != self->m_trackArtist) {
                        self->m_isPlaying = playing;
                        self->m_trackTitle = title;
                        self->m_trackArtist = artist;
                        emit self->mediaUpdated();
                    }
                },
                Qt::QueuedConnection
            );
        }
    }).detach();
#endif
}

void WinPlatform::triggerMenuOpenSanctuary() {
    emit openSanctuaryRequested();
}

void WinPlatform::triggerMenuToggleHidden() {
    emit toggleHiddenRequested();
}

void WinPlatform::triggerMenuSummon() {
    emit summonRequested();
}

void WinPlatform::triggerMenuQuit() {
    emit quitRequested();
}

void registerWinPlatformTypes() {
    qmlRegisterUncreatableType<WinScreenObj>(
        "WinPlatform", 1, 0, "WinScreen", QStringLiteral("WinScreen instances are owned by WinPlatform")
    );
    qmlRegisterSingletonType<WinPlatform>("WinPlatform", 1, 0, "WinPlatform", [](QQmlEngine *, QJSEngine *) -> QObject * {
        return WinPlatform::instance();
    });
}
