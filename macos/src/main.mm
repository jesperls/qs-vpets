#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>

#include "MacPlatform.h"
#include "QsCompat.h"

#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QGuiApplication>
#include <QLocalSocket>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QSocketNotifier>
#include <QUrl>

#include <csignal>
#include <sys/socket.h>
#include <unistd.h>

#ifndef QS_VPETS_VERSION_STR
#define QS_VPETS_VERSION_STR "0.5.0"
#endif

static int s_sigPipe[2] = { -1, -1 };

static void posixSignalHandler(int) {
    const char ch = 1;
    (void)::write(s_sigPipe[0], &ch, sizeof(ch));
}

@interface VpetsAppleEventHandler : NSObject
- (void)handleReopenEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)replyEvent;
@end

@implementation VpetsAppleEventHandler
- (void)handleReopenEvent:(NSAppleEventDescriptor *)event withReplyEvent:(NSAppleEventDescriptor *)replyEvent {
    (void)event;
    (void)replyEvent;
    MacPlatform::instance()->triggerMenuOpenSanctuary();
}
@end

static bool tryPingExistingInstance(bool openSanctuary) {
    QLocalSocket probe;
    probe.connectToServer(QsIpcServer::defaultSocketPath());
    if (!probe.waitForConnected(250)) {
        return false;
    }
    probe.disconnectFromServer();
    if (openSanctuary) {
        QsIpcServer::sendClientCall(QStringLiteral("open"), {});
    }
    return true;
}

static QString locateShellRoot(const QString &appDirPath) {
    const QByteArray envShell = qgetenv("QS_VPETS_SHELL_DIR");
    if (!envShell.isEmpty()) {
        const QString p = QString::fromLocal8Bit(envShell);
        if (QFileInfo::exists(p + QStringLiteral("/shell.qml"))) return p;
    }

    // 1. Inside macOS .app bundle: Contents/MacOS/../Resources/qml/shell.qml
    const QString bundleQml = QDir::cleanPath(appDirPath + QStringLiteral("/../Resources/qml"));
    if (QFileInfo::exists(bundleQml + QStringLiteral("/shell.qml"))) return bundleQml;

    // 2. Installed prefix share directory: bin/../share/qs-vpets-macos/qml/shell.qml
    const QString shareQml = QDir::cleanPath(appDirPath + QStringLiteral("/../share/qs-vpets/qml"));
    if (QFileInfo::exists(shareQml + QStringLiteral("/shell.qml"))) return shareQml;

    return bundleQml;
}

int main(int argc, char *argv[]) {
    for (int i = 1; i < argc; ++i) {
        const QString arg = QString::fromLocal8Bit(argv[i]);
        if (arg == QLatin1String("--version") || arg == QLatin1String("-v") || arg == QLatin1String("version")) {
            printf("qs-vpets %s\n", QS_VPETS_VERSION_STR);
            return 0;
        }
        if (arg == QLatin1String("--ipc")) {
            QCoreApplication cliApp(argc, argv);
            if (i + 1 >= argc) {
                fprintf(stderr, "qs-vpets: --ipc requires a method name\n");
                return 1;
            }
            const QString method = QString::fromLocal8Bit(argv[i + 1]);
            QStringList callArgs;
            for (int j = i + 2; j < argc; ++j) {
                callArgs.append(QString::fromLocal8Bit(argv[j]));
            }
            return QsIpcServer::sendClientCall(method, callArgs);
        }
    }

    bool explicitBackground = false;
    bool explicitOpen = false;
    for (int i = 1; i < argc; ++i) {
        const QString arg = QString::fromLocal8Bit(argv[i]);
        if (arg == QLatin1String("--background") || arg == QLatin1String("run")) {
            explicitBackground = true;
        } else if (arg == QLatin1String("--open") || arg == QLatin1String("open")) {
            explicitOpen = true;
        }
    }

    const QByteArray envOpen = qgetenv("QS_VPETS_OPEN_ON_START");
    const bool openOnStart = explicitOpen || (!explicitBackground && envOpen != "0");

    if (tryPingExistingInstance(openOnStart)) {
        return 0;
    }

    if (openOnStart) {
        qputenv("QS_VPETS_OPEN_ON_START", "1");
    }

    QQuickWindow::setDefaultAlphaBuffer(true);

    const QString exeDir = QFileInfo(QString::fromLocal8Bit(argv[0])).absolutePath();
    const bool isBundledDeploy = QFileInfo::exists(QDir::cleanPath(exeDir + QStringLiteral("/../PlugIns")));
    if (!isBundledDeploy) {
        // Support unbundled Homebrew builds where qtbase and qtdeclarative live in separate prefixes
        for (const QString &plugDir : {
                 QStringLiteral("/opt/homebrew/share/qt/plugins"),
                 QStringLiteral("/opt/homebrew/opt/qtdeclarative/share/qt/plugins"),
                 QStringLiteral("/opt/homebrew/opt/qtsvg/share/qt/plugins"),
                 QStringLiteral("/opt/homebrew/opt/qtimageformats/share/qt/plugins"),
                 QStringLiteral("/usr/local/share/qt/plugins"),
                 QStringLiteral("/usr/local/opt/qtdeclarative/share/qt/plugins"),
                 QStringLiteral("/usr/local/opt/qtsvg/share/qt/plugins"),
                 QStringLiteral("/usr/local/opt/qtimageformats/share/qt/plugins"),
             }) {
            if (QFileInfo::exists(plugDir)) {
                QCoreApplication::addLibraryPath(plugDir);
            }
        }
    }

    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("Pokémon Sanctuary"));
    app.setOrganizationDomain(QStringLiteral("io.github.jesperls"));
    app.setQuitOnLastWindowClosed(false);

    VpetsAppleEventHandler *aeHandler = nil;
    @autoreleasepool {
        [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        aeHandler = [[VpetsAppleEventHandler alloc] init];
        [[NSAppleEventManager sharedAppleEventManager] setEventHandler:aeHandler
                                                           andSelector:@selector(handleReopenEvent:withReplyEvent:)
                                                         forEventClass:kCoreEventClass
                                                            andEventID:kAEReopenApplication];
    }

    if (::socketpair(AF_UNIX, SOCK_STREAM, 0, s_sigPipe) == 0) {
        auto *sigNotifier = new QSocketNotifier(s_sigPipe[1], QSocketNotifier::Read, &app);
        QObject::connect(sigNotifier, &QSocketNotifier::activated, &app, [&app, sigNotifier]() {
            sigNotifier->setEnabled(false);
            char tmp = 0;
            (void)::read(s_sigPipe[1], &tmp, sizeof(tmp));
            QsIpcServer::instance()->invokeLocal(QStringLiteral("vpets"), QStringLiteral("flush"), {});
            app.quit();
        });
        struct sigaction sa {};
        sa.sa_handler = posixSignalHandler;
        sigemptyset(&sa.sa_mask);
        sa.sa_flags = SA_RESTART;
        ::sigaction(SIGINT, &sa, nullptr);
        ::sigaction(SIGTERM, &sa, nullptr);
    }

    registerQsCompatTypes();
    registerMacPlatformTypes();
    QsIpcServer::instance()->listen();
    (void)MacPlatform::instance();

    const QString shellRoot = locateShellRoot(QCoreApplication::applicationDirPath());
    const QString shellQmlPath = shellRoot + QStringLiteral("/shell.qml");
    if (!QFileInfo::exists(shellQmlPath)) {
        fprintf(stderr, "qs-vpets: shell.qml not found at %s\n", shellQmlPath.toUtf8().constData());
        return 1;
    }

    QQmlApplicationEngine engine;
    if (!isBundledDeploy) {
        for (const QString &qmlDir : {
                 QStringLiteral("/opt/homebrew/share/qt/qml"),
                 QStringLiteral("/opt/homebrew/opt/qtdeclarative/share/qt/qml"),
                 QStringLiteral("/opt/homebrew/opt/qt/share/qt/qml"),
                 QStringLiteral("/usr/local/share/qt/qml"),
                 QStringLiteral("/usr/local/opt/qtdeclarative/share/qt/qml"),
                 QStringLiteral("/usr/local/opt/qt/share/qt/qml"),
             }) {
            if (QFileInfo::exists(qmlDir)) {
                engine.addImportPath(qmlDir);
            }
        }
    }
    engine.addImportPath(shellRoot);
    QObject::connect(
        &engine,
        &QQmlApplicationEngine::objectCreationFailed,
        &app,
        []() { QCoreApplication::exit(1); },
        Qt::QueuedConnection
    );
    engine.load(QUrl::fromLocalFile(shellQmlPath));
    if (engine.rootObjects().isEmpty()) {
        return 1;
    }

    const int rc = app.exec();
    @autoreleasepool {
        if (aeHandler) {
            [[NSAppleEventManager sharedAppleEventManager] removeEventHandlerForEventClass:kCoreEventClass
                                                                                andEventID:kAEReopenApplication];
        }
    }
    return rc;
}
