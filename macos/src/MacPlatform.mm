#include "MacPlatform.h"

#import <AppKit/AppKit.h>
#import <AudioToolbox/AudioToolbox.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreGraphics/CoreGraphics.h>
#import <IOKit/ps/IOPSKeys.h>
#import <IOKit/ps/IOPowerSources.h>

#include <QCoreApplication>
#include <QDateTime>
#include <QProcess>
#include <QtQml>

#include <cmath>
#include <mach/mach.h>
#include <mach/mach_host.h>
#include <mach/processor_info.h>
#include <unistd.h>

@interface VpetsMenuTarget : NSObject
@property (nonatomic, assign) MacPlatform *platform;
- (void)openSanctuary:(id)sender;
- (void)toggleHidden:(id)sender;
- (void)summonCompanion:(id)sender;
- (void)quitApp:(id)sender;
- (void)screensDidChange:(NSNotification *)note;
- (void)spaceDidChange:(NSNotification *)note;
- (void)appDidActivate:(NSNotification *)note;
- (void)systemWillSleep:(NSNotification *)note;
- (void)systemDidWake:(NSNotification *)note;
@end

@implementation VpetsMenuTarget
- (void)openSanctuary:(id)sender {
    (void)sender;
    if (self.platform) self.platform->triggerMenuOpenSanctuary();
}
- (void)toggleHidden:(id)sender {
    (void)sender;
    if (self.platform) self.platform->triggerMenuToggleHidden();
}
- (void)summonCompanion:(id)sender {
    (void)sender;
    if (self.platform) self.platform->triggerMenuSummon();
}
- (void)quitApp:(id)sender {
    (void)sender;
    if (self.platform) self.platform->triggerMenuQuit();
}
- (void)screensDidChange:(NSNotification *)note {
    (void)note;
    if (self.platform) self.platform->refreshScreens();
}
- (void)spaceDidChange:(NSNotification *)note {
    (void)note;
    if (self.platform) self.platform->notifySpaceChanged();
}
- (void)appDidActivate:(NSNotification *)note {
    (void)note;
    if (self.platform) self.platform->notifyAppActivated();
}
- (void)systemWillSleep:(NSNotification *)note {
    (void)note;
    if (self.platform) self.platform->notifySystemWillSleep();
}
- (void)systemDidWake:(NSNotification *)note {
    (void)note;
    if (self.platform) self.platform->notifySystemDidWake();
}
@end

// --- MacScreenObj ---

MacScreenObj::MacScreenObj(quint32 displayId, QObject *parent)
    : QObject(parent)
    , m_displayId(displayId) {}

bool MacScreenObj::update(
    const QString &name,
    double x,
    double y,
    double w,
    double h,
    int topIn,
    int bottomIn,
    int leftIn,
    int rightIn
) {
    if (m_name == name && qFuzzyCompare(m_x + 1.0, x + 1.0) && qFuzzyCompare(m_y + 1.0, y + 1.0)
        && qFuzzyCompare(m_width, w) && qFuzzyCompare(m_height, h) && m_topInset == topIn
        && m_bottomInset == bottomIn && m_leftInset == leftIn && m_rightInset == rightIn) {
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
    emit changed();
    return true;
}

// --- MacPlatform ---

MacPlatform *MacPlatform::instance() {
    static MacPlatform *s_inst = new MacPlatform(qApp);
    return s_inst;
}

MacPlatform::MacPlatform(QObject *parent)
    : QObject(parent) {
    refreshScreens();
    setupNotificationsAndMonitors();
    setupStatusBar();

    pollIdleAndCursor();
    pollWindows();
    pollTelemetryAndPower();
    pollAudioAndMedia();

    auto *fastTimer = new QTimer(this);
    fastTimer->setInterval(65);
    connect(fastTimer, &QTimer::timeout, this, &MacPlatform::pollIdleAndCursor);
    fastTimer->start();

    auto *winTimer = new QTimer(this);
    winTimer->setInterval(650);
    connect(winTimer, &QTimer::timeout, this, &MacPlatform::pollWindows);
    winTimer->start();

    auto *audioTimer = new QTimer(this);
    audioTimer->setInterval(2500);
    connect(audioTimer, &QTimer::timeout, this, &MacPlatform::pollAudioAndMedia);
    audioTimer->start();

    auto *sysTimer = new QTimer(this);
    sysTimer->setInterval(5000);
    connect(sysTimer, &QTimer::timeout, this, &MacPlatform::pollTelemetryAndPower);
    sysTimer->start();
}

MacPlatform::~MacPlatform() {
    if (m_globalMouseMonitor) {
        id mon = CFBridgingRelease(m_globalMouseMonitor);
        [NSEvent removeMonitor:mon];
        m_globalMouseMonitor = nullptr;
    }
    if (m_localMouseMonitor) {
        id mon = CFBridgingRelease(m_localMouseMonitor);
        [NSEvent removeMonitor:mon];
        m_localMouseMonitor = nullptr;
    }
    if (m_observerTarget) {
        id target = CFBridgingRelease(m_observerTarget);
        [[NSNotificationCenter defaultCenter] removeObserver:target];
        [[[NSWorkspace sharedWorkspace] notificationCenter] removeObserver:target];
        m_observerTarget = nullptr;
    }
    if (m_statusItem) {
        NSStatusItem *item = (NSStatusItem *)CFBridgingRelease(m_statusItem);
        [[NSStatusBar systemStatusBar] removeStatusItem:item];
        m_statusItem = nullptr;
    }
}

static NSWindow *nsWindowForQWindow(QWindow *win) {
    if (!win) return nil;
    WId wid = win->winId();
    if (!wid) return nil;
    NSView *nsView = (__bridge NSView *)reinterpret_cast<void *>(wid);
    return nsView ? [nsView window] : nil;
}

void MacPlatform::refreshScreens() {
    @autoreleasepool {
        NSArray<NSScreen *> *nsScreens = [NSScreen screens];
        if ([nsScreens count] == 0) return;

        // NSScreen.screens[0] is always the zero-origin primary display in Cocoa coordinates.
        const NSRect zeroFrame = [[nsScreens objectAtIndex:0] frame];
        m_primaryScreenHeight = zeroFrame.size.height;

        QSet<quint32> seenIds;
        QVariantList nextList;
        QVariantMap nextInsets;
        QStringList newlyConnected;
        bool anyChanged = false;
        QSet<QString> usedNames;

        for (NSUInteger i = 0; i < [nsScreens count]; ++i) {
            NSScreen *scr = [nsScreens objectAtIndex:i];
            NSDictionary *desc = [scr deviceDescription];
            NSNumber *num = [desc objectForKey:@"NSScreenNumber"];
            const quint32 did = num ? [num unsignedIntValue] : static_cast<quint32>(i + 1);
            seenIds.insert(did);

            NSString *locName = [scr localizedName];
            QString baseName = locName ? QString::fromNSString(locName).trimmed() : QStringLiteral("Display %1").arg(i + 1);
            if (baseName.isEmpty()) baseName = QStringLiteral("Display %1").arg(i + 1);
            QString uniqueName = baseName;
            int suffix = 2;
            while (usedNames.contains(uniqueName)) {
                uniqueName = QStringLiteral("%1 (%2)").arg(baseName).arg(suffix++);
            }
            usedNames.insert(uniqueName);

            const NSRect fr = [scr frame];
            const NSRect vis = [scr visibleFrame];

            // Convert bottom-left Cocoa rect into top-down global Quartz/Qt logical coordinates
            const double gx = fr.origin.x;
            const double gy = m_primaryScreenHeight - (fr.origin.y + fr.size.height);
            const double gw = fr.size.width;
            const double gh = fr.size.height;

            const double visTop = m_primaryScreenHeight - (vis.origin.y + vis.size.height);
            const double visBottom = visTop + vis.size.height;

            const int topInset = std::max(0, static_cast<int>(std::lround(visTop - gy)));
            const int bottomInset = std::max(0, static_cast<int>(std::lround((gy + gh) - visBottom)));
            const int leftInset = std::max(0, static_cast<int>(std::lround(vis.origin.x - fr.origin.x)));
            const int rightInset = std::max(
                0, static_cast<int>(std::lround((fr.origin.x + fr.size.width) - (vis.origin.x + vis.size.width)))
            );

            MacScreenObj *obj = m_screenById.value(did, nullptr);
            if (!obj) {
                obj = new MacScreenObj(did, this);
                QQmlEngine::setObjectOwnership(obj, QQmlEngine::CppOwnership);
                m_screenById.insert(did, obj);
                anyChanged = true;
                if (m_screensBooted) newlyConnected.append(uniqueName);
            }
            if (obj->update(uniqueName, gx, gy, gw, gh, topInset, bottomInset, leftInset, rightInset)) {
                anyChanged = true;
            }
            nextList.append(QVariant::fromValue(static_cast<QObject *>(obj)));

            QVariantMap insMap;
            insMap.insert(QStringLiteral("top"), topInset);
            insMap.insert(QStringLiteral("bottom"), bottomInset);
            insMap.insert(QStringLiteral("left"), leftInset);
            insMap.insert(QStringLiteral("right"), rightInset);
            nextInsets.insert(uniqueName, insMap);
        }

        auto it = m_screenById.begin();
        while (it != m_screenById.end()) {
            if (!seenIds.contains(it.key())) {
                it.value()->deleteLater();
                it = m_screenById.erase(it);
                anyChanged = true;
            } else {
                ++it;
            }
        }

        const bool countChanged = (m_screens.size() != nextList.size());
        m_screens = nextList;
        m_monitorInsets = nextInsets;
        m_screensBooted = true;

        if (anyChanged || countChanged) {
            emit screensChanged();
        }
        for (const QString &nm : newlyConnected) {
            emit monitorConnected(nm);
        }
    }
}

void MacPlatform::applyOverlayStyle(QWindow *win) {
    if (!win) return;
    @autoreleasepool {
        NSWindow *nsWin = nsWindowForQWindow(win);
        if (!nsWin) return;
        [nsWin setLevel:NSFloatingWindowLevel];
        [nsWin setCollectionBehavior:(NSWindowCollectionBehaviorCanJoinAllSpaces
                                      | NSWindowCollectionBehaviorStationary
                                      | NSWindowCollectionBehaviorFullScreenAuxiliary
                                      | NSWindowCollectionBehaviorIgnoresCycle)];
        [nsWin setOpaque:NO];
        [nsWin setBackgroundColor:[NSColor clearColor]];
        [nsWin setHasShadow:NO];
        [nsWin setMovable:NO];
        [nsWin setRestorable:NO];
        [nsWin setHidesOnDeactivate:NO];
        if (win->isVisible()) {
            [nsWin orderFrontRegardless];
        }
        if (m_overlays.contains(win)) {
            m_overlays[win].lastIgnoresMouse = -1;
        }
        updateMousePassthrough();
    }
}

void MacPlatform::configureOverlayWindow(QWindow *win) {
    if (!win) return;
    if (!m_overlays.contains(win)) {
        OverlayEntry entry;
        entry.window = win;
        m_overlays.insert(win, entry);

        connect(win, &QWindow::visibleChanged, this, [this, win](bool vis) {
            if (vis) {
                applyOverlayStyle(win);
                QTimer::singleShot(0, this, [this, win]() { applyOverlayStyle(win); });
            }
        });
        connect(win, &QObject::destroyed, this, [this, win]() { m_overlays.remove(win); });
    }
    applyOverlayStyle(win);
    QTimer::singleShot(0, this, [this, win]() { applyOverlayStyle(win); });
}

void MacPlatform::setOverlayInteractiveRects(QWindow *win, const QVariantList &rects, bool captureAll) {
    if (!win) return;
    OverlayEntry &entry = m_overlays[win];
    entry.window = win;
    entry.captureAll = captureAll;
    entry.rects.clear();
    entry.rects.reserve(rects.size());
    for (const QVariant &v : rects) {
        const QVariantMap m = v.toMap();
        const double x = m.value(QStringLiteral("x")).toDouble();
        const double y = m.value(QStringLiteral("y")).toDouble();
        const double w = m.value(QStringLiteral("w")).toDouble();
        const double h = m.value(QStringLiteral("h")).toDouble();
        if (w > 0 && h > 0) {
            entry.rects.append(QRectF(x, y, w, h));
        }
    }
    updateMousePassthrough();
}

void MacPlatform::unregisterOverlayWindow(QWindow *win) {
    m_overlays.remove(win);
}

void MacPlatform::configureSanctuaryWindow(QWindow *win) {
    if (!win) return;
    @autoreleasepool {
        NSWindow *nsWin = nsWindowForQWindow(win);
        if (!nsWin) return;
        [nsWin setCollectionBehavior:NSWindowCollectionBehaviorMoveToActiveSpace];
        [nsWin setOpaque:NO];
        [nsWin setBackgroundColor:[NSColor clearColor]];
        [nsWin setHasShadow:YES];
        [nsWin setMovableByWindowBackground:NO];
        [nsWin setRestorable:NO];
    }
}

void MacPlatform::activateSanctuaryWindow(QWindow *win) {
    @autoreleasepool {
        if (@available(macOS 14.0, *)) {
            [NSApp activate];
        } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
            [NSApp activateIgnoringOtherApps:YES];
#pragma clang diagnostic pop
        }
        if (!win) return;
        win->show();
        win->raise();
        win->requestActivate();
        NSWindow *nsWin = nsWindowForQWindow(win);
        if (nsWin) {
            [nsWin makeKeyAndOrderFront:nil];
            [nsWin orderFrontRegardless];
        }
    }
}

void MacPlatform::setPetsHiddenState(bool hidden) {
    @autoreleasepool {
        if (m_toggleHideMenuItem) {
            NSMenuItem *item = (__bridge NSMenuItem *)m_toggleHideMenuItem;
            [item setTitle:(hidden ? @"Show Desktop Pets" : @"Hide Desktop Pets")];
        }
    }
}

void MacPlatform::updateMousePassthrough() {
    if (m_overlays.isEmpty() || !m_cursorKnown) return;
    @autoreleasepool {
        const NSUInteger buttonsDown = [NSEvent pressedMouseButtons];
        QWindow *capturingWin = nullptr;
        for (auto it = m_overlays.begin(); it != m_overlays.end(); ++it) {
            if (it.value().captureAll && buttonsDown == 0) {
                it.value().captureAll = false;
            }
            if (!capturingWin && it.value().window && it.value().window->isVisible() && it.value().captureAll) {
                capturingWin = it.value().window;
            }
        }

        for (auto it = m_overlays.begin(); it != m_overlays.end(); ++it) {
            QWindow *win = it.value().window;
            if (!win) continue;
            NSWindow *nsWin = nsWindowForQWindow(win);
            if (!nsWin) continue;

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
                [nsWin setIgnoresMouseEvents:(shouldIgnore ? YES : NO)];
            }
        }
    }
}

void MacPlatform::handleCursorEvent() {
    @autoreleasepool {
        const NSPoint mousePt = [NSEvent mouseLocation];
        const double gx = mousePt.x;
        const double gy = m_primaryScreenHeight - mousePt.y;
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
}

void MacPlatform::pollIdleAndCursor() {
    handleCursorEvent();
    const double idle = CGEventSourceSecondsSinceLastEventType(
        kCGEventSourceStateCombinedSessionState, kCGAnyInputEventType
    );
    if (std::isfinite(idle) && idle >= 0.0 && std::abs(idle - m_idleSeconds) >= 0.2) {
        m_idleSeconds = idle;
        emit idleUpdated();
    }
}

void MacPlatform::notifySpaceChanged() {
    m_lastSpaceChangeMs = QDateTime::currentMSecsSinceEpoch();
    emit workspaceChanged();
    pollWindows();
}

void MacPlatform::notifyAppActivated() {
    pollWindows();
}

void MacPlatform::notifySystemWillSleep() {
    m_sleepBeganMs = QDateTime::currentMSecsSinceEpoch();
}

void MacPlatform::notifySystemDidWake() {
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

void MacPlatform::pollWindows() {
    @autoreleasepool {
        const pid_t selfPid = ::getpid();
        NSRunningApplication *frontApp = [[NSWorkspace sharedWorkspace] frontmostApplication];
        const pid_t frontPid = frontApp ? [frontApp processIdentifier] : -1;

        CFArrayRef winList = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID
        );
        if (!winList) return;

        QVariantList nextWins;
        QHash<QString, WinSnapshot> nextMap;
        QList<QRectF> frontOpaqueRects;

        QVariant nextActivePos;
        QString nextActiveCls;
        QString nextActiveTitle;
        bool nextFullscreen = false;
        bool foundActive = false;

        const CFIndex count = CFArrayGetCount(winList);
        for (CFIndex i = 0; i < count; ++i) {
            NSDictionary *info = (__bridge NSDictionary *)CFArrayGetValueAtIndex(winList, i);
            if (!info) continue;

            const int layer = [[info objectForKey:(__bridge NSString *)kCGWindowLayer] intValue];
            if (layer != 0) continue;

            const pid_t ownerPid = [[info objectForKey:(__bridge NSString *)kCGWindowOwnerPID] intValue];
            if (ownerPid == selfPid) continue;

            NSNumber *alphaNum = [info objectForKey:(__bridge NSString *)kCGWindowAlpha];
            if (alphaNum && [alphaNum doubleValue] < 0.05) continue;

            CGRect cgBounds = CGRectZero;
            CFDictionaryRef boundsDict = (__bridge CFDictionaryRef)[info objectForKey:(__bridge NSString *)kCGWindowBounds];
            if (!boundsDict || !CGRectMakeWithDictionaryRepresentation(boundsDict, &cgBounds)) continue;

            const double wx = cgBounds.origin.x;
            const double wy = cgBounds.origin.y;
            const double ww = cgBounds.size.width;
            const double wh = cgBounds.size.height;
            if (ww < 160.0 || wh < 90.0) continue;

            NSString *ownerNs = [info objectForKey:(__bridge NSString *)kCGWindowOwnerName];
            NSString *titleNs = [info objectForKey:(__bridge NSString *)kCGWindowName];
            const QString cls = ownerNs ? QString::fromNSString(ownerNs) : QString();
            const QString title = (titleNs && [titleNs length] > 0) ? QString::fromNSString(titleNs) : cls;
            if (cls == QLatin1String("Window Server") || cls == QLatin1String("Dock")) continue;

            const uint32_t winNum = [[info objectForKey:(__bridge NSString *)kCGWindowNumber] unsignedIntValue];
            const QString addr = QStringLiteral("0x%1").arg(winNum, 0, 16);

            // Locate screen containing window center
            const double cx = wx + ww * 0.5;
            const double cy = wy + wh * 0.5;
            MacScreenObj *winScreen = nullptr;
            for (const QVariant &sv : m_screens) {
                auto *so = qobject_cast<MacScreenObj *>(sv.value<QObject *>());
                if (so && cx >= so->x() && cx < so->x() + so->width() && cy >= so->y() && cy < so->y() + so->height()) {
                    winScreen = so;
                    break;
                }
            }

            bool isTrueFullscreen = false;
            bool isFlushToMenuBar = false;
            if (winScreen) {
                isTrueFullscreen = (wx <= winScreen->x() + 2.0 && wy <= winScreen->y() + 2.0
                                    && ww >= winScreen->width() - 4.0 && wh >= winScreen->height() - 4.0);
                // Prevent perching on maximized windows pushed right up against the Menu Bar / Notch
                isFlushToMenuBar = (wy <= winScreen->y() + winScreen->topInset() + 28.0);
            }

            // Check if top titlebar ledge is occluded by higher z-order windows
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

            const QRectF qrect(wx, wy, ww, wh);
            frontOpaqueRects.append(qrect);
            nextMap.insert(addr, WinSnapshot { cls, title, qrect });

            const bool isFocusedWin = !foundActive && (ownerPid == frontPid || frontPid <= 0);
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
                wm.insert(QStringLiteral("fullscreen"), isTrueFullscreen || isFlushToMenuBar);
                wm.insert(QStringLiteral("trueFullscreen"), isTrueFullscreen);
                nextWins.append(wm);
            }
        }

        CFRelease(winList);

        const int nextCount = nextMap.size();
        const qint64 now = QDateTime::currentMSecsSinceEpoch();
        const bool inSpaceSettle = (now - m_lastSpaceChangeMs) < 1200;

        if (m_windowsBooted && !inSpaceSettle) {
            for (auto it = nextMap.constBegin(); it != nextMap.constEnd(); ++it) {
                if (!m_prevWindows.contains(it.key())) {
                    emit windowOpened(it.value().cls, it.value().title);
                } else {
                    const QRectF &oldR = m_prevWindows[it.key()].rect;
                    const QRectF &newR = it.value().rect;
                    const double moved = std::hypot(newR.x() - oldR.x(), newR.y() - oldR.y())
                                       + std::hypot(newR.width() - oldR.width(), newR.height() - oldR.height());
                    if (moved >= 18.0) {
                        emit windowShifted(
                            it.value().cls, newR.x(), newR.y(), newR.width(), newR.height(), it.key()
                        );
                    }
                }
            }
            for (auto it = m_prevWindows.constBegin(); it != m_prevWindows.constEnd(); ++it) {
                if (!nextMap.contains(it.key())) {
                    const QRectF &r = it.value().rect;
                    emit windowClosed(
                        it.value().cls, r.center().x(), r.center().y(), r.width(), r.height(), it.key()
                    );
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

        const QString focusSig = nextActiveCls + QStringLiteral("|")
                               + (nextActivePos.isValid() ? nextActivePos.toMap().value(QStringLiteral("address")).toString() : QString());
        const bool focusChanged = (focusSig != m_prevFocusedSig);
        m_prevFocusedSig = focusSig;
        m_activeWindowPos = nextActivePos;
        m_activeWindowClass = nextActiveCls;
        m_activeWindowTitle = nextActiveTitle;
        emit activeWindowUpdated();

        if (focusChanged && !nextActiveCls.isEmpty()) {
            emit windowFocused(nextActiveCls, nextActiveTitle);
        }
    }
}

void MacPlatform::pollTelemetryAndPower() {
    // 1. CPU Load via Mach host_statistics
    host_cpu_load_info_data_t cpuInfo;
    mach_msg_type_number_t count = HOST_CPU_LOAD_INFO_COUNT;
    if (host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, reinterpret_cast<host_info_t>(&cpuInfo), &count) == KERN_SUCCESS) {
        const quint64 user = cpuInfo.cpu_ticks[CPU_STATE_USER];
        const quint64 sys = cpuInfo.cpu_ticks[CPU_STATE_SYSTEM];
        const quint64 nice = cpuInfo.cpu_ticks[CPU_STATE_NICE];
        const quint64 idle = cpuInfo.cpu_ticks[CPU_STATE_IDLE];
        const quint64 total = user + sys + nice + idle;
        if (m_prevCpuTotal > 0 && total > m_prevCpuTotal) {
            const double dTotal = static_cast<double>(total - m_prevCpuTotal);
            const double dIdle = static_cast<double>(idle - m_prevCpuIdle);
            m_cpuUsage = std::clamp(1.0 - (dIdle / dTotal), 0.0, 1.0);
        }
        m_prevCpuTotal = total;
        m_prevCpuIdle = idle;
    }

    // 2. Memory Load via Mach vm_statistics64
    vm_size_t pageSize = 4096;
    host_page_size(mach_host_self(), &pageSize);
    vm_statistics64_data_t vmStat;
    mach_msg_type_number_t vmCount = HOST_VM_INFO64_COUNT;
    if (host_statistics64(mach_host_self(), HOST_VM_INFO64, reinterpret_cast<host_info64_t>(&vmStat), &vmCount) == KERN_SUCCESS) {
        const double active = static_cast<double>(vmStat.active_count + vmStat.wire_count + vmStat.compressor_page_count);
        const double freePages = static_cast<double>(vmStat.free_count + vmStat.inactive_count);
        const double sum = active + freePages;
        if (sum > 0) m_memUsage = std::clamp(active / sum, 0.0, 1.0);
    }

    // 3. Apple Silicon Thermal State + CPU Warmth
    @autoreleasepool {
        const NSProcessInfoThermalState ts = [[NSProcessInfo processInfo] thermalState];
        double stateWarmth = 0.0;
        switch (ts) {
        case NSProcessInfoThermalStateNominal: stateWarmth = 0.08; break;
        case NSProcessInfoThermalStateFair: stateWarmth = 0.45; break;
        case NSProcessInfoThermalStateSerious: stateWarmth = 0.78; break;
        case NSProcessInfoThermalStateCritical: stateWarmth = 1.0; break;
        }
        const double loadNorm = std::clamp((m_cpuUsage - 0.16) / 0.65, 0.0, 1.0);
        m_thermalWarmth = std::clamp(std::max(stateWarmth, loadNorm * 0.85), 0.0, 1.0);
    }
    emit telemetryUpdated();

    // 4. MacBook Battery & MagSafe / USB-C Power via IOKit
    bool foundBat = false;
    double batPct = 1.0;
    bool acPlugged = true;

    CFTypeRef blob = IOPSCopyPowerSourcesInfo();
    if (blob) {
        CFArrayRef sources = IOPSCopyPowerSourcesList(blob);
        if (sources) {
            const CFIndex n = CFArrayGetCount(sources);
            for (CFIndex i = 0; i < n; ++i) {
                CFDictionaryRef ps = IOPSGetPowerSourceDescription(blob, CFArrayGetValueAtIndex(sources, i));
                if (!ps) continue;
                NSDictionary *dict = (__bridge NSDictionary *)ps;
                NSString *type = [dict objectForKey:@kIOPSTypeKey];
                if (type && ![type isEqualToString:@kIOPSInternalBatteryType]) continue;

                NSNumber *curCap = [dict objectForKey:@kIOPSCurrentCapacityKey];
                NSNumber *maxCap = [dict objectForKey:@kIOPSMaxCapacityKey];
                NSString *pwrState = [dict objectForKey:@kIOPSPowerSourceStateKey];
                if (curCap && maxCap && [maxCap doubleValue] > 0.0) {
                    foundBat = true;
                    batPct = std::clamp([curCap doubleValue] / [maxCap doubleValue], 0.0, 1.0);
                    acPlugged = pwrState ? [pwrState isEqualToString:@kIOPSACPowerValue] : true;
                    break;
                }
            }
            CFRelease(sources);
        }
        CFRelease(blob);
    }

    const bool powerChanged = (m_hasBattery != foundBat) || (m_isPluggedIn != acPlugged)
                            || (std::abs(m_batteryLevel - batPct) >= 0.01);
    m_hasBattery = foundBat;
    m_batteryLevel = batPct;
    m_isPluggedIn = acPlugged;
    m_onBattery = foundBat && !acPlugged;
    if (powerChanged) emit powerUpdated();
}

static AudioDeviceID defaultAudioDevice(bool input) {
    AudioObjectPropertyAddress addr = {
        input ? kAudioHardwarePropertyDefaultInputDevice : kAudioHardwarePropertyDefaultOutputDevice,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    AudioDeviceID devId = kAudioObjectUnknown;
    UInt32 size = sizeof(devId);
    if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &addr, 0, nullptr, &size, &devId) == noErr) {
        return devId;
    }
    return kAudioObjectUnknown;
}

void MacPlatform::pollAudioAndMedia() {
    // 1. Output volume & mute
    const AudioDeviceID outDev = defaultAudioDevice(false);
    double vol = m_audioVolume;
    bool muted = m_audioMuted;
    if (outDev != kAudioObjectUnknown) {
        Float32 v32 = 0.0f;
        UInt32 vsize = sizeof(v32);
        AudioObjectPropertyAddress vAddr = {
            kAudioHardwareServiceDeviceProperty_VirtualMainVolume,
            kAudioDevicePropertyScopeOutput,
            kAudioObjectPropertyElementMain
        };
        if (AudioObjectGetPropertyData(outDev, &vAddr, 0, nullptr, &vsize, &v32) == noErr) {
            vol = std::clamp(static_cast<double>(v32), 0.0, 1.0);
        }
        UInt32 m32 = 0;
        UInt32 msize = sizeof(m32);
        AudioObjectPropertyAddress mAddr = {
            kAudioDevicePropertyMute,
            kAudioDevicePropertyScopeOutput,
            kAudioObjectPropertyElementMain
        };
        if (AudioObjectGetPropertyData(outDev, &mAddr, 0, nullptr, &msize, &m32) == noErr) {
            muted = (m32 != 0);
        }
    }

    // 2. Input mic active check (Zoom / FaceTime / Discord / Meet)
    const AudioDeviceID inDev = defaultAudioDevice(true);
    bool micRun = false;
    if (inDev != kAudioObjectUnknown) {
        UInt32 running = 0;
        UInt32 rsize = sizeof(running);
        AudioObjectPropertyAddress rAddr = {
            kAudioDevicePropertyDeviceIsRunningSomewhere,
            kAudioDevicePropertyScopeInput,
            kAudioObjectPropertyElementMain
        };
        if (AudioObjectGetPropertyData(inDev, &rAddr, 0, nullptr, &rsize, &running) == noErr) {
            micRun = (running != 0);
        }
    }

    if (std::abs(vol - m_audioVolume) >= 0.01 || muted != m_audioMuted || micRun != m_micActive) {
        m_audioVolume = vol;
        m_audioMuted = muted;
        m_micActive = micRun;
        emit audioUpdated();
    }

    // 3. Lightweight Now Playing check (only spawns osascript when Music or Spotify is actually running)
    queryNowPlayingAsync();
}

void MacPlatform::queryNowPlayingAsync() {
    if (m_mediaQueryRunning) return;

    bool hasSpotify = false;
    bool hasMusic = false;
    @autoreleasepool {
        for (NSRunningApplication *app in [[NSWorkspace sharedWorkspace] runningApplications]) {
            NSString *bid = [app bundleIdentifier];
            if (!bid) continue;
            if ([bid isEqualToString:@"com.spotify.client"]) hasSpotify = true;
            else if ([bid isEqualToString:@"com.apple.Music"]) hasMusic = true;
        }
    }

    if (!hasSpotify && !hasMusic) {
        if (m_isPlaying || !m_trackTitle.isEmpty() || !m_trackArtist.isEmpty()) {
            m_isPlaying = false;
            m_trackTitle.clear();
            m_trackArtist.clear();
            emit mediaUpdated();
        }
        return;
    }

    m_mediaQueryRunning = true;
    auto *proc = new QProcess(this);
    QString script;
    if (hasSpotify) {
        script += QStringLiteral(
            "tell application \"Spotify\"\n"
            "  if player state is playing then return \"PLAYING||\" & (name of current track) & \"||\" & (artist of current track)\n"
            "end tell\n"
        );
    }
    if (hasMusic) {
        script += QStringLiteral(
            "tell application \"Music\"\n"
            "  if player state is playing then return \"PLAYING||\" & (name of current track) & \"||\" & (artist of current track)\n"
            "end tell\n"
        );
    }
    script += QStringLiteral("return \"STOPPED\"");

    connect(proc, &QProcess::finished, this, [this, proc](int, QProcess::ExitStatus) {
        m_mediaQueryRunning = false;
        const QString out = QString::fromUtf8(proc->readAllStandardOutput()).trimmed();
        proc->deleteLater();

        bool playing = false;
        QString title, artist;
        if (out.startsWith(QLatin1String("PLAYING||"))) {
            const QStringList parts = out.split(QStringLiteral("||"));
            playing = true;
            title = parts.value(1);
            artist = parts.value(2);
        }
        if (playing != m_isPlaying || title != m_trackTitle || artist != m_trackArtist) {
            m_isPlaying = playing;
            m_trackTitle = title;
            m_trackArtist = artist;
            emit mediaUpdated();
        }
    });
    connect(proc, &QProcess::errorOccurred, this, [this, proc](QProcess::ProcessError) {
        m_mediaQueryRunning = false;
        proc->deleteLater();
    });
    proc->start(QStringLiteral("/usr/bin/osascript"), { QStringLiteral("-e"), script });
}

void MacPlatform::setupNotificationsAndMonitors() {
    @autoreleasepool {
        VpetsMenuTarget *target = [[VpetsMenuTarget alloc] init];
        target.platform = this;
        m_observerTarget = CFBridgingRetain(target);

        [[NSNotificationCenter defaultCenter] addObserver:target
                                                 selector:@selector(screensDidChange:)
                                                     name:NSApplicationDidChangeScreenParametersNotification
                                                   object:nil];

        NSNotificationCenter *wsCenter = [[NSWorkspace sharedWorkspace] notificationCenter];
        [wsCenter addObserver:target
                     selector:@selector(spaceDidChange:)
                         name:NSWorkspaceActiveSpaceDidChangeNotification
                       object:nil];
        [wsCenter addObserver:target
                     selector:@selector(appDidActivate:)
                         name:NSWorkspaceDidActivateApplicationNotification
                       object:nil];
        [wsCenter addObserver:target
                     selector:@selector(systemWillSleep:)
                         name:NSWorkspaceWillSleepNotification
                       object:nil];
        [wsCenter addObserver:target
                     selector:@selector(systemDidWake:)
                         name:NSWorkspaceDidWakeNotification
                       object:nil];

        const NSEventMask mask = NSEventMaskMouseMoved | NSEventMaskLeftMouseDragged | NSEventMaskRightMouseDragged
                               | NSEventMaskLeftMouseUp | NSEventMaskRightMouseUp;
        id globalMon = [NSEvent addGlobalMonitorForEventsMatchingMask:mask
                                                              handler:^(NSEvent *ev) {
                                                                  const NSEventType t = ev.type;
                                                                  if (t == NSEventTypeLeftMouseUp || t == NSEventTypeRightMouseUp) {
                                                                      QTimer::singleShot(0, this, [this]() { this->handleCursorEvent(); });
                                                                  } else {
                                                                      this->handleCursorEvent();
                                                                  }
                                                              }];
        if (globalMon) m_globalMouseMonitor = CFBridgingRetain(globalMon);

        id localMon = [NSEvent addLocalMonitorForEventsMatchingMask:mask
                                                            handler:^NSEvent *(NSEvent *ev) {
                                                                const NSEventType t = ev.type;
                                                                if (t == NSEventTypeLeftMouseUp || t == NSEventTypeRightMouseUp) {
                                                                    QTimer::singleShot(0, this, [this]() { this->handleCursorEvent(); });
                                                                } else {
                                                                    this->handleCursorEvent();
                                                                }
                                                                return ev;
                                                            }];
        if (localMon) m_localMouseMonitor = CFBridgingRetain(localMon);
    }
}

void MacPlatform::setupStatusBar() {
    @autoreleasepool {
        NSStatusItem *statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
        if (!statusItem) return;
        m_statusItem = CFBridgingRetain(statusItem);

        NSImage *icon = [NSImage imageWithSize:NSMakeSize(18, 18)
                                       flipped:NO
                                drawingHandler:^BOOL(NSRect) {
                                    [[NSColor blackColor] setStroke];
                                    [[NSColor blackColor] setFill];

                                    NSBezierPath *outer = [NSBezierPath bezierPathWithOvalInRect:NSMakeRect(2.0, 2.0, 14.0, 14.0)];
                                    [outer setLineWidth:1.6];
                                    [outer stroke];

                                    NSBezierPath *bandL = [NSBezierPath bezierPath];
                                    [bandL moveToPoint:NSMakePoint(2.2, 9.0)];
                                    [bandL lineToPoint:NSMakePoint(6.6, 9.0)];
                                    [bandL moveToPoint:NSMakePoint(11.4, 9.0)];
                                    [bandL lineToPoint:NSMakePoint(15.8, 9.0)];
                                    [bandL setLineWidth:1.6];
                                    [bandL stroke];

                                    NSBezierPath *center = [NSBezierPath bezierPathWithOvalInRect:NSMakeRect(6.7, 6.7, 4.6, 4.6)];
                                    [center setLineWidth:1.5];
                                    [center stroke];
                                    return YES;
                                }];
        [icon setTemplate:YES];
        if (statusItem.button) {
            statusItem.button.image = icon;
            statusItem.button.toolTip = @"Pokémon Sanctuary";
        }

        VpetsMenuTarget *target = (__bridge VpetsMenuTarget *)m_observerTarget;
        NSMenu *menu = [[NSMenu alloc] initWithTitle:@"Pokémon Sanctuary"];

        NSMenuItem *openItem = [[NSMenuItem alloc] initWithTitle:@"Open Pokémon Sanctuary"
                                                          action:@selector(openSanctuary:)
                                                   keyEquivalent:@"o"];
        [openItem setTarget:target];
        [menu addItem:openItem];

        NSMenuItem *summonItem = [[NSMenuItem alloc] initWithTitle:@"Summon Companion to Cursor"
                                                            action:@selector(summonCompanion:)
                                                     keyEquivalent:@""];
        [summonItem setTarget:target];
        [menu addItem:summonItem];

        NSMenuItem *hideItem = [[NSMenuItem alloc] initWithTitle:@"Hide Desktop Pets"
                                                          action:@selector(toggleHidden:)
                                                   keyEquivalent:@""];
        [hideItem setTarget:target];
        [menu addItem:hideItem];
        m_toggleHideMenuItem = (__bridge const void *)hideItem;

        [menu addItem:[NSMenuItem separatorItem]];

        NSMenuItem *quitItem = [[NSMenuItem alloc] initWithTitle:@"Quit Pokémon Sanctuary"
                                                          action:@selector(quitApp:)
                                                   keyEquivalent:@"q"];
        [quitItem setTarget:target];
        [menu addItem:quitItem];

        statusItem.menu = menu;
    }
}

void MacPlatform::triggerMenuOpenSanctuary() { emit openSanctuaryRequested(); }
void MacPlatform::triggerMenuToggleHidden() { emit toggleHiddenRequested(); }
void MacPlatform::triggerMenuSummon() { emit summonRequested(); }
void MacPlatform::triggerMenuQuit() { emit quitRequested(); }

void registerMacPlatformTypes() {
    qmlRegisterUncreatableType<MacScreenObj>("MacPlatform", 1, 0, "MacScreen", QStringLiteral("Managed by MacPlatform"));
    qmlRegisterSingletonType<MacPlatform>("MacPlatform", 1, 0, "MacPlatform", [](QQmlEngine *, QJSEngine *) -> QObject * {
        auto *inst = MacPlatform::instance();
        QQmlEngine::setObjectOwnership(inst, QQmlEngine::CppOwnership);
        return inst;
    });
}
