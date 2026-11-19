#include "QsCompat.h"
#include "WinPlatform.h"

#include <QCoreApplication>
#include <QDebug>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalSocket>
#include <QMetaMethod>
#include <QSaveFile>
#include <QTimer>
#include <QUrl>
#include <QWindow>
#include <QtQml>

#include <cstdio>

// --- QsSingletonBase ---

QsSingletonBase::QsSingletonBase(QObject *parent)
    : QObject(parent) {}

QQmlListProperty<QObject> QsSingletonBase::data() {
    return QQmlListProperty<QObject>(
        this,
        nullptr,
        &QsSingletonBase::appendData,
        &QsSingletonBase::countData,
        &QsSingletonBase::atData,
        &QsSingletonBase::clearData
    );
}

void QsSingletonBase::appendData(QQmlListProperty<QObject> *list, QObject *obj) {
    auto *self = static_cast<QsSingletonBase *>(list->object);
    if (!obj) return;
    if (!obj->parent()) obj->setParent(self);
    self->m_data.append(obj);
}

qsizetype QsSingletonBase::countData(QQmlListProperty<QObject> *list) {
    return static_cast<QsSingletonBase *>(list->object)->m_data.size();
}

QObject *QsSingletonBase::atData(QQmlListProperty<QObject> *list, qsizetype index) {
    return static_cast<QsSingletonBase *>(list->object)->m_data.at(index);
}

void QsSingletonBase::clearData(QQmlListProperty<QObject> *list) {
    static_cast<QsSingletonBase *>(list->object)->m_data.clear();
}

// --- QuickshellEnv ---

QuickshellEnv::QuickshellEnv(QObject *parent)
    : QObject(parent) {}

QString QuickshellEnv::env(const QString &name) const {
    const QString direct = qEnvironmentVariable(name.toUtf8().constData());
    if (!direct.isEmpty()) {
        if (name.endsWith(QLatin1String("_DIR")) || name.endsWith(QLatin1String("_HOME"))
            || name.endsWith(QLatin1String("_FILE")) || name == QLatin1String("HOME")) {
            return QDir::fromNativeSeparators(direct);
        }
        return direct;
    }

    if (name == QLatin1String("HOME")) {
        return QDir::homePath();
    }
    if (name == QLatin1String("XDG_CONFIG_HOME")) {
        const QString appData = qEnvironmentVariable("APPDATA");
        return !appData.isEmpty() ? QDir::fromNativeSeparators(appData)
                                  : (QDir::homePath() + QStringLiteral("/AppData/Roaming"));
    }
    if (name == QLatin1String("XDG_STATE_HOME")) {
        const QString localData = qEnvironmentVariable("LOCALAPPDATA");
        return !localData.isEmpty() ? QDir::fromNativeSeparators(localData)
                                    : (QDir::homePath() + QStringLiteral("/AppData/Local"));
    }
    if (name == QLatin1String("XDG_CACHE_HOME")) {
        const QString localData = qEnvironmentVariable("LOCALAPPDATA");
        const QString base = !localData.isEmpty() ? QDir::fromNativeSeparators(localData)
                                                  : (QDir::homePath() + QStringLiteral("/AppData/Local"));
        return base + QStringLiteral("/cache");
    }
    return QString();
}

// --- QsFileView ---

QsFileView::QsFileView(QObject *parent)
    : QObject(parent) {}

QString QsFileView::normalizePath(const QString &raw) {
    QString norm;
    if (raw.startsWith(QLatin1String("file://"))) {
        norm = QUrl(raw).toLocalFile();
    } else {
        norm = QDir::fromNativeSeparators(raw);
    }
    if (norm.size() >= 3 && norm.at(0) == QLatin1Char('/') && norm.at(1).isLetter() && norm.at(2) == QLatin1Char(':')) {
        norm = norm.mid(1);
    }
    return norm;
}

void QsFileView::setPath(const QString &p) {
    const QString norm = normalizePath(p);
    if (m_path == norm) return;
    m_path = norm;
    emit pathChanged();
    syncWatcher();
    if (m_complete) scheduleLoad();
}

void QsFileView::setWatchChanges(bool w) {
    if (m_watchChanges == w) return;
    m_watchChanges = w;
    emit watchChangesChanged();
    syncWatcher();
}

void QsFileView::setPrintErrors(bool p) {
    if (m_printErrors == p) return;
    m_printErrors = p;
    emit printErrorsChanged();
}

void QsFileView::componentComplete() {
    m_complete = true;
    syncWatcher();
    if (!m_path.isEmpty()) scheduleLoad();
}

void QsFileView::syncWatcher() {
    if (!m_watchChanges || m_path.isEmpty()) {
        if (m_watcher) {
            delete m_watcher;
            m_watcher = nullptr;
        }
        return;
    }
    if (!m_watcher) {
        m_watcher = new QFileSystemWatcher(this);
        auto onChanged = [this](const QString &) {
            if (QDateTime::currentMSecsSinceEpoch() < m_ignoreWatchUntilMs) {
                syncWatcher();
                return;
            }
            syncWatcher();
            emit fileChanged();
        };
        connect(m_watcher, &QFileSystemWatcher::fileChanged, this, onChanged);
        connect(m_watcher, &QFileSystemWatcher::directoryChanged, this, [this](const QString &) {
            if (QDateTime::currentMSecsSinceEpoch() < m_ignoreWatchUntilMs) return;
            if (!m_path.isEmpty() && QFileInfo::exists(m_path)) {
                syncWatcher();
                emit fileChanged();
            }
        });
    }
    const QStringList curFiles = m_watcher->files();
    if (!curFiles.isEmpty()) m_watcher->removePaths(curFiles);
    const QStringList curDirs = m_watcher->directories();
    if (!curDirs.isEmpty()) m_watcher->removePaths(curDirs);

    if (QFileInfo::exists(m_path)) {
        m_watcher->addPath(m_path);
    } else {
        const QString parentDir = QFileInfo(m_path).absolutePath();
        if (QFileInfo::exists(parentDir)) m_watcher->addPath(parentDir);
    }
}

void QsFileView::scheduleLoad() {
    const quint64 gen = ++m_loadGen;
    if (m_path.isEmpty()) {
        m_text.clear();
        return;
    }
    QTimer::singleShot(0, this, [this, gen]() { performLoad(gen); });
}

void QsFileView::reload() {
    if (m_path.isEmpty()) return;
    performLoad(++m_loadGen);
}

void QsFileView::performLoad(quint64 gen) {
    if (gen != m_loadGen || m_path.isEmpty()) return;
    QFile file(m_path);
    if (!file.exists()) {
        if (m_printErrors) qWarning() << "FileView: file not found:" << m_path;
        emit loadFailed(QsFileViewError::FileNotFound);
        return;
    }
    if (!file.open(QIODevice::ReadOnly)) {
        if (m_printErrors) qWarning() << "FileView: read failed:" << m_path;
        emit loadFailed(QsFileViewError::ReadError);
        return;
    }
    m_text = QString::fromUtf8(file.readAll());
    file.close();
    syncWatcher();
    emit loaded();
}

void QsFileView::setText(const QString &content) {
    if (m_path.isEmpty()) return;
    QFileInfo fi(m_path);
    QDir().mkpath(fi.absolutePath());

    m_ignoreWatchUntilMs = QDateTime::currentMSecsSinceEpoch() + 260;
    QSaveFile out(m_path);
    if (!out.open(QIODevice::WriteOnly)) {
        if (m_printErrors) qWarning() << "FileView: open for write failed:" << m_path;
        return;
    }
    const QByteArray utf8 = content.toUtf8();
    if (out.write(utf8) != utf8.size() || !out.commit()) {
        if (m_printErrors) qWarning() << "FileView: atomic commit failed:" << m_path;
        return;
    }
    m_text = content;
    syncWatcher();
}

// --- QsProcess ---

QsProcess::QsProcess(QObject *parent)
    : QObject(parent) {}

void QsProcess::setCommand(const QStringList &cmd) {
    if (m_command == cmd) return;
    m_command = cmd;
    emit commandChanged();
}

void QsProcess::setRunning(bool run) {
    if (!m_complete) {
        m_wantRunOnComplete = run;
        return;
    }
    if (run && !m_running) {
        startProcess();
    } else if (!run && m_running && m_proc) {
        m_proc->kill();
    }
}

void QsProcess::componentComplete() {
    m_complete = true;
    if (m_wantRunOnComplete) {
        m_wantRunOnComplete = false;
        startProcess();
    }
}

void QsProcess::startProcess() {
    if (m_command.isEmpty()) {
        emit exited(1, 0);
        return;
    }

    // Handle common POSIX file utility invocations natively on Windows without external binaries
    const QString prog = m_command.first();
    if (prog == QLatin1String("mkdir") || prog == QLatin1String("rm")) {
        m_running = true;
        emit runningChanged();
        const QStringList args = m_command.mid(1);
        int code = 0;
        if (prog == QLatin1String("mkdir")) {
            for (const QString &a : args) {
                if (a.isEmpty() || a.startsWith(QLatin1Char('-'))) continue;
                if (!QDir().mkpath(QDir::fromNativeSeparators(a))) code = 1;
            }
        } else {
            for (const QString &a : args) {
                if (a.isEmpty() || a.startsWith(QLatin1Char('-'))) continue;
                const QString norm = QDir::fromNativeSeparators(a);
                if (QFileInfo::exists(norm)) {
                    QFile::remove(norm);
                }
            }
        }
        QTimer::singleShot(0, this, [this, code]() {
            m_running = false;
            emit runningChanged();
            emit exited(code, 0);
        });
        return;
    }

    if (!m_proc) {
        m_proc = new QProcess(this);
        connect(m_proc, &QProcess::finished, this, [this](int code, QProcess::ExitStatus status) {
            m_running = false;
            emit runningChanged();
            emit exited(code, static_cast<int>(status));
        });
        connect(m_proc, &QProcess::errorOccurred, this, [this](QProcess::ProcessError) {
            if (m_running) {
                m_running = false;
                emit runningChanged();
                emit exited(127, 1);
            }
        });
    }
    m_running = true;
    emit runningChanged();
    m_proc->start(prog, m_command.mid(1));
}

// --- QsIpcHandler & QsIpcServer ---

QsIpcHandler::QsIpcHandler(QObject *parent)
    : QsSingletonBase(parent) {}

QsIpcHandler::~QsIpcHandler() {
    if (!m_target.isEmpty()) {
        QsIpcServer::instance()->unregisterHandler(m_target, this);
    }
}

void QsIpcHandler::setTarget(const QString &t) {
    if (m_target == t) return;
    if (!m_target.isEmpty()) {
        QsIpcServer::instance()->unregisterHandler(m_target, this);
    }
    m_target = t;
    emit targetChanged();
    if (!m_target.isEmpty()) {
        QsIpcServer::instance()->registerHandler(m_target, this);
    }
}

void QsIpcHandler::componentComplete() {
    QsSingletonBase::componentComplete();
    if (!m_target.isEmpty()) {
        QsIpcServer::instance()->registerHandler(m_target, this);
    }
}

QsIpcServer::QsIpcServer(QObject *parent)
    : QObject(parent) {}

QsIpcServer *QsIpcServer::instance() {
    static QsIpcServer *s_inst = new QsIpcServer(qApp);
    return s_inst;
}

QString QsIpcServer::defaultSocketPath() {
    const QString envSock = qEnvironmentVariable("QS_VPETS_SOCKET");
    if (!envSock.isEmpty()) return envSock;

    QString user = qEnvironmentVariable("USERNAME");
    if (user.isEmpty()) user = QStringLiteral("default");
    QString clean;
    clean.reserve(user.size());
    for (const QChar &ch : user) {
        if (ch.isLetterOrNumber() || ch == QLatin1Char('_') || ch == QLatin1Char('-')) {
            clean.append(ch);
        }
    }
    if (clean.isEmpty()) clean = QStringLiteral("user");
    return QStringLiteral("qs-vpets-") + clean.left(40);
}

bool QsIpcServer::listen(const QString &socketPath) {
    if (m_server) return m_server->isListening();
    m_server = new QLocalServer(this);
    m_server->setSocketOptions(QLocalServer::UserAccessOption);
    QLocalServer::removeServer(socketPath);
    if (!m_server->listen(socketPath)) {
        qWarning() << "qs-vpets: failed to listen on IPC pipe" << socketPath << m_server->errorString();
        return false;
    }
    connect(m_server, &QLocalServer::newConnection, this, [this]() {
        while (QLocalSocket *client = m_server->nextPendingConnection()) {
            connect(client, &QLocalSocket::readyRead, this, [this, client]() {
                if (!client->canReadLine()) return;
                const QByteArray line = client->readLine().trimmed();
                const QJsonDocument doc = QJsonDocument::fromJson(line);
                const QJsonObject obj = doc.object();
                const QString target = obj.value(QStringLiteral("target")).toString(QStringLiteral("vpets"));
                const QString method = obj.value(QStringLiteral("method")).toString();
                QStringList args;
                const QJsonArray arr = obj.value(QStringLiteral("args")).toArray();
                for (const QJsonValue &v : arr) args.append(v.toString());

                bool ok = false;
                const QString res = invokeLocal(target, method, args, &ok);
                QJsonObject reply;
                reply.insert(QStringLiteral("ok"), ok);
                reply.insert(QStringLiteral("result"), res);
                client->write(QJsonDocument(reply).toJson(QJsonDocument::Compact) + "\n");
                client->flush();
                client->waitForBytesWritten(500);
                client->disconnectFromServer();
            });
            connect(client, &QLocalSocket::disconnected, client, &QObject::deleteLater);
        }
    });
    return true;
}

void QsIpcServer::registerHandler(const QString &target, QsIpcHandler *handler) {
    m_handlers.insert(target, handler);
}

void QsIpcServer::unregisterHandler(const QString &target, QsIpcHandler *handler) {
    if (m_handlers.value(target) == handler) {
        m_handlers.remove(target);
    }
}

QString QsIpcServer::invokeLocal(const QString &target, const QString &method, const QStringList &args, bool *okOut) {
    if (okOut) *okOut = false;
    if (method == QLatin1String("win_debug")) {
        QJsonArray winArr;
        int visCount = 0;
        int totalSprites = 0;
        int loadedSprites = 0;
        for (QWindow *w : QGuiApplication::topLevelWindows()) {
            if (!w) continue;
            const bool vis = w->isVisible() && w->visibility() != QWindow::Hidden;
            if (vis) ++visCount;
            const QList<QObject *> children = w->findChildren<QObject *>();
            for (QObject *child : children) {
                if (!child) continue;
                const QVariant useProp = child->property("useSpriteSheet");
                if (useProp.isValid()) {
                    ++totalSprites;
                    if (useProp.toBool()) ++loadedSprites;
                }
            }
            QJsonObject wo;
            wo.insert(QStringLiteral("title"), w->title());
            wo.insert(QStringLiteral("visible"), w->isVisible());
            wo.insert(QStringLiteral("visibility"), static_cast<int>(w->visibility()));
            wo.insert(QStringLiteral("x"), w->x());
            wo.insert(QStringLiteral("y"), w->y());
            wo.insert(QStringLiteral("w"), w->width());
            wo.insert(QStringLiteral("h"), w->height());
            winArr.append(wo);
        }
        QJsonObject out;
        out.insert(QStringLiteral("visibleWindows"), visCount);
        out.insert(QStringLiteral("totalSprites"), totalSprites);
        out.insert(QStringLiteral("loadedSprites"), loadedSprites);
        out.insert(QStringLiteral("windows"), winArr);
        if (okOut) *okOut = true;
        return QString::fromUtf8(QJsonDocument(out).toJson(QJsonDocument::Indented)).trimmed();
    }

    QsIpcHandler *handler = m_handlers.value(target, nullptr);
    if (!handler || method.isEmpty()) return QStringLiteral("handler not found");

    const QMetaObject *meta = handler->metaObject();
    int bestIdx = -1;
    int bestParamCount = -1;
    for (int i = meta->methodOffset(); i < meta->methodCount(); ++i) {
        const QMetaMethod mm = meta->method(i);
        if (QString::fromLatin1(mm.name()) == method) {
            if (mm.parameterCount() == args.size()) {
                bestIdx = i;
                bestParamCount = mm.parameterCount();
                break;
            }
            if (mm.parameterCount() > bestParamCount && mm.parameterCount() <= 3) {
                bestIdx = i;
                bestParamCount = mm.parameterCount();
            }
        }
    }
    if (bestIdx < 0) return QStringLiteral("unknown command: ") + method;

    const QMetaMethod mm = meta->method(bestIdx);
    QStringList padded = args;
    while (padded.size() < mm.parameterCount()) padded.append(QString());

    QVariant retVal;
    bool invoked = false;
    const bool returnsVariant = mm.returnMetaType() == QMetaType::fromType<QVariant>();
    const bool returnsString = mm.returnMetaType() == QMetaType::fromType<QString>();

    auto callWithStringReturn = [&]() -> bool {
        QString sRet;
        bool ok = false;
        switch (mm.parameterCount()) {
        case 0:
            ok = mm.invoke(handler, Qt::DirectConnection, Q_RETURN_ARG(QString, sRet));
            break;
        case 1:
            ok = mm.invoke(handler, Qt::DirectConnection, Q_RETURN_ARG(QString, sRet), Q_ARG(QString, padded[0]));
            break;
        case 2:
            ok = mm.invoke(
                handler, Qt::DirectConnection, Q_RETURN_ARG(QString, sRet), Q_ARG(QString, padded[0]), Q_ARG(QString, padded[1])
            );
            break;
        default:
            break;
        }
        if (ok) retVal = sRet;
        return ok;
    };

    auto callWithVariantReturn = [&]() -> bool {
        bool ok = false;
        QVariant v0(padded.value(0)), v1(padded.value(1));
        switch (mm.parameterCount()) {
        case 0:
            ok = mm.invoke(handler, Qt::DirectConnection, Q_RETURN_ARG(QVariant, retVal));
            break;
        case 1:
            ok = mm.invoke(handler, Qt::DirectConnection, Q_RETURN_ARG(QVariant, retVal), Q_ARG(QVariant, v0));
            break;
        case 2:
            ok = mm.invoke(handler, Qt::DirectConnection, Q_RETURN_ARG(QVariant, retVal), Q_ARG(QVariant, v0), Q_ARG(QVariant, v1));
            break;
        default:
            break;
        }
        return ok;
    };

    if (returnsString) invoked = callWithStringReturn();
    else if (returnsVariant) invoked = callWithVariantReturn();
    else {
        switch (mm.parameterCount()) {
        case 0: invoked = mm.invoke(handler, Qt::DirectConnection); break;
        case 1: invoked = mm.invoke(handler, Qt::DirectConnection, Q_ARG(QString, padded[0])); break;
        case 2: invoked = mm.invoke(handler, Qt::DirectConnection, Q_ARG(QString, padded[0]), Q_ARG(QString, padded[1])); break;
        default: break;
        }
    }

    if (okOut) *okOut = invoked;
    if (invoked && method == QLatin1String("open")) {
        QTimer::singleShot(25, WinPlatform::instance(), []() {
            WinPlatform::instance()->triggerMenuOpenSanctuary();
        });
    }
    return invoked ? retVal.toString() : QStringLiteral("invocation failed");
}

int QsIpcServer::sendClientCall(const QString &method, const QStringList &args, const QString &socketPath) {
    QLocalSocket sock;
    sock.connectToServer(socketPath);
    if (!sock.waitForConnected(1500)) {
        std::fprintf(stderr, "qs-vpets: not running (start with 'qs-vpets open' or 'qs-vpets start')\n");
        std::fflush(stderr);
        return 1;
    }

    QJsonObject req;
    req.insert(QStringLiteral("target"), QStringLiteral("vpets"));
    req.insert(QStringLiteral("method"), method);
    QJsonArray arr;
    for (const QString &a : args) arr.append(a);
    req.insert(QStringLiteral("args"), arr);

    sock.write(QJsonDocument(req).toJson(QJsonDocument::Compact) + "\n");
    sock.flush();

    QByteArray buf;
    while (sock.waitForReadyRead(3000)) {
        buf.append(sock.readAll());
        if (buf.contains('\n')) break;
    }

    const QJsonDocument doc = QJsonDocument::fromJson(buf.trimmed());
    if (!doc.isObject()) {
        std::fprintf(stderr, "qs-vpets: invalid IPC response\n");
        std::fflush(stderr);
        return 1;
    }
    const QJsonObject reply = doc.object();
    const QString result = reply.value(QStringLiteral("result")).toString();
    if (!reply.value(QStringLiteral("ok")).toBool()) {
        std::fprintf(stderr, "qs-vpets: %s\n", result.toUtf8().constData());
        std::fflush(stderr);
        return 1;
    }
    if (!result.isEmpty()) {
        std::printf("%s\n", result.toUtf8().constData());
        std::fflush(stdout);
    }
    return 0;
}

void registerQsCompatTypes() {
    qmlRegisterType<QsSingletonBase>("Quickshell", 1, 0, "Singleton");
    qmlRegisterType<QsSingletonBase>("Quickshell", 1, 0, "Scope");
    qmlRegisterSingletonType<QuickshellEnv>("Quickshell", 1, 0, "Quickshell", [](QQmlEngine *, QJSEngine *) -> QObject * {
        return new QuickshellEnv();
    });

    qmlRegisterUncreatableType<QsFileViewError>(
        "Quickshell.Io", 1, 0, "FileViewError", QStringLiteral("FileViewError is an enum container")
    );
    qmlRegisterType<QsFileView>("Quickshell.Io", 1, 0, "FileView");
    qmlRegisterType<QsProcess>("Quickshell.Io", 1, 0, "Process");
    qmlRegisterType<QsIpcHandler>("Quickshell.Io", 1, 0, "IpcHandler");
}
