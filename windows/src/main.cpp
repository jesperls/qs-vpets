#include "QsCompat.h"
#include "WinPlatform.h"

#include <windows.h>
#include <objbase.h>

#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QGuiApplication>
#include <QLocalSocket>
#include <QMetaObject>
#include <QQmlApplicationEngine>
#include <QQuickWindow>
#include <QUrl>

#include <cstdio>

#ifndef QS_VPETS_VERSION_STR
#define QS_VPETS_VERSION_STR "0.11.0"
#endif

namespace {

void attachParentConsoleIfNeeded() {
    const bool stdoutMissing = (GetFileType(GetStdHandle(STD_OUTPUT_HANDLE)) == FILE_TYPE_UNKNOWN);
    const bool stderrMissing = (GetFileType(GetStdHandle(STD_ERROR_HANDLE)) == FILE_TYPE_UNKNOWN);
    if (!stdoutMissing && !stderrMissing) return;
    if (AttachConsole(ATTACH_PARENT_PROCESS)) {
        FILE *dummy = nullptr;
        if (stdoutMissing) freopen_s(&dummy, "CONOUT$", "w", stdout);
        if (stderrMissing) freopen_s(&dummy, "CONOUT$", "w", stderr);
    }
}

BOOL WINAPI consoleCtrlHandler(DWORD ctrlType) {
    if (ctrlType == CTRL_C_EVENT || ctrlType == CTRL_BREAK_EVENT || ctrlType == CTRL_CLOSE_EVENT) {
        if (QCoreApplication *app = QCoreApplication::instance()) {
            QMetaObject::invokeMethod(
                app,
                [app]() {
                    QsIpcServer::instance()->invokeLocal(QStringLiteral("vpets"), QStringLiteral("flush"), {});
                    app->quit();
                },
                Qt::QueuedConnection
            );
            return TRUE;
        }
    }
    return FALSE;
}

bool tryPingExistingInstance(bool openSanctuary) {
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

QString locateShellRoot(const QString &appDirPath) {
    const QString envShell = qEnvironmentVariable("QS_VPETS_SHELL_DIR");
    if (!envShell.isEmpty()) {
        const QString p = QDir::fromNativeSeparators(envShell);
        if (QFileInfo::exists(p + QStringLiteral("/shell.qml"))) return p;
    }

    const QString localQml = QDir::cleanPath(appDirPath + QStringLiteral("/qml"));
    if (QFileInfo::exists(localQml + QStringLiteral("/shell.qml"))) return localQml;

    const QString shareQml = QDir::cleanPath(appDirPath + QStringLiteral("/../share/qs-vpets/qml"));
    if (QFileInfo::exists(shareQml + QStringLiteral("/shell.qml"))) return shareQml;

    return localQml;
}

} // namespace

int main(int argc, char *argv[]) {
    for (int i = 1; i < argc; ++i) {
        const QString arg = QString::fromLocal8Bit(argv[i]);
        if (arg == QLatin1String("--version") || arg == QLatin1String("-v") || arg == QLatin1String("version")) {
            attachParentConsoleIfNeeded();
            std::printf("qs-vpets %s\n", QS_VPETS_VERSION_STR);
            std::fflush(stdout);
            return 0;
        }
        if (arg == QLatin1String("--ipc")) {
            attachParentConsoleIfNeeded();
            QCoreApplication cliApp(argc, argv);
            if (i + 1 >= argc) {
                std::fprintf(stderr, "qs-vpets: --ipc requires a method name\n");
                std::fflush(stderr);
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

    const HRESULT comHr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    QQuickWindow::setDefaultAlphaBuffer(true);

    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("Pokémon Sanctuary"));
    app.setOrganizationDomain(QStringLiteral("io.github.jesperls"));
    app.setQuitOnLastWindowClosed(false);

    SetConsoleCtrlHandler(consoleCtrlHandler, TRUE);

    registerQsCompatTypes();
    registerWinPlatformTypes();
    QsIpcServer::instance()->listen();
    (void)WinPlatform::instance();

    const QString shellRoot = locateShellRoot(QCoreApplication::applicationDirPath());
    const QString shellQmlPath = shellRoot + QStringLiteral("/shell.qml");
    if (!QFileInfo::exists(shellQmlPath)) {
        attachParentConsoleIfNeeded();
        std::fprintf(stderr, "qs-vpets: shell.qml not found at %s\n", shellQmlPath.toUtf8().constData());
        std::fflush(stderr);
        if (SUCCEEDED(comHr)) CoUninitialize();
        return 1;
    }

    QQmlApplicationEngine engine;
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
        if (SUCCEEDED(comHr)) CoUninitialize();
        return 1;
    }

    const int rc = app.exec();
    if (SUCCEEDED(comHr)) CoUninitialize();
    return rc;
}
