#pragma once

#include <QDateTime>
#include <QFileSystemWatcher>
#include <QHash>
#include <QLocalServer>
#include <QObject>
#include <QProcess>
#include <QQmlListProperty>
#include <QQmlParserStatus>
#include <QString>
#include <QStringList>

class QsSingletonBase : public QObject, public QQmlParserStatus {
    Q_OBJECT
    Q_INTERFACES(QQmlParserStatus)
    Q_PROPERTY(QQmlListProperty<QObject> data READ data CONSTANT)
    Q_CLASSINFO("DefaultProperty", "data")

public:
    explicit QsSingletonBase(QObject *parent = nullptr);

    QQmlListProperty<QObject> data();
    void classBegin() override {}
    void componentComplete() override {}

private:
    static void appendData(QQmlListProperty<QObject> *list, QObject *obj);
    static qsizetype countData(QQmlListProperty<QObject> *list);
    static QObject *atData(QQmlListProperty<QObject> *list, qsizetype index);
    static void clearData(QQmlListProperty<QObject> *list);

    QList<QObject *> m_data;
};

class QuickshellEnv : public QObject {
    Q_OBJECT

public:
    explicit QuickshellEnv(QObject *parent = nullptr);
    Q_INVOKABLE QString env(const QString &name) const;
};

class QsFileViewError : public QObject {
    Q_OBJECT

public:
    enum Error {
        NoError = 0,
        FileNotFound = 1,
        ReadError = 2,
        WriteError = 3
    };
    Q_ENUM(Error)
};

class QsFileView : public QObject, public QQmlParserStatus {
    Q_OBJECT
    Q_INTERFACES(QQmlParserStatus)
    Q_PROPERTY(QString path READ path WRITE setPath NOTIFY pathChanged)
    Q_PROPERTY(bool watchChanges READ watchChanges WRITE setWatchChanges NOTIFY watchChangesChanged)
    Q_PROPERTY(bool printErrors READ printErrors WRITE setPrintErrors NOTIFY printErrorsChanged)

public:
    explicit QsFileView(QObject *parent = nullptr);

    QString path() const { return m_path; }
    void setPath(const QString &p);

    bool watchChanges() const { return m_watchChanges; }
    void setWatchChanges(bool w);

    bool printErrors() const { return m_printErrors; }
    void setPrintErrors(bool p);

    Q_INVOKABLE QString text() const { return m_text; }
    Q_INVOKABLE void setText(const QString &content);
    Q_INVOKABLE void reload();

    void classBegin() override {}
    void componentComplete() override;

signals:
    void pathChanged();
    void watchChangesChanged();
    void printErrorsChanged();
    void loaded();
    void loadFailed(int err);
    void fileChanged();

private:
    void scheduleLoad();
    void performLoad(quint64 gen);
    void syncWatcher();
    static QString normalizePath(const QString &raw);

    QString m_path;
    QString m_text;
    bool m_watchChanges = false;
    bool m_printErrors = true;
    bool m_complete = false;
    quint64 m_loadGen = 0;
    qint64 m_ignoreWatchUntilMs = 0;
    QFileSystemWatcher *m_watcher = nullptr;
};

class QsProcess : public QObject, public QQmlParserStatus {
    Q_OBJECT
    Q_INTERFACES(QQmlParserStatus)
    Q_PROPERTY(QStringList command READ command WRITE setCommand NOTIFY commandChanged)
    Q_PROPERTY(bool running READ running WRITE setRunning NOTIFY runningChanged)

public:
    explicit QsProcess(QObject *parent = nullptr);

    QStringList command() const { return m_command; }
    void setCommand(const QStringList &cmd);

    bool running() const { return m_running; }
    void setRunning(bool run);

    void classBegin() override {}
    void componentComplete() override;

signals:
    void commandChanged();
    void runningChanged();
    void exited(int exitCode, int exitStatus);

private:
    void startProcess();

    QStringList m_command;
    bool m_running = false;
    bool m_wantRunOnComplete = false;
    bool m_complete = false;
    QProcess *m_proc = nullptr;
};

class QsIpcHandler : public QsSingletonBase {
    Q_OBJECT
    Q_PROPERTY(QString target READ target WRITE setTarget NOTIFY targetChanged)

public:
    explicit QsIpcHandler(QObject *parent = nullptr);
    ~QsIpcHandler() override;

    QString target() const { return m_target; }
    void setTarget(const QString &t);

    void componentComplete() override;

signals:
    void targetChanged();

private:
    QString m_target;
};

class QsIpcServer : public QObject {
    Q_OBJECT

public:
    static QsIpcServer *instance();
    static QString defaultSocketPath();

    bool listen(const QString &socketPath = defaultSocketPath());
    void registerHandler(const QString &target, QsIpcHandler *handler);
    void unregisterHandler(const QString &target, QsIpcHandler *handler);
    QString invokeLocal(const QString &target, const QString &method, const QStringList &args, bool *okOut = nullptr);

    static int sendClientCall(const QString &method, const QStringList &args, const QString &socketPath = defaultSocketPath());

private:
    explicit QsIpcServer(QObject *parent = nullptr);

    QLocalServer *m_server = nullptr;
    QHash<QString, QsIpcHandler *> m_handlers;
};

void registerQsCompatTypes();
