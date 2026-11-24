cmake_minimum_required(VERSION 3.22)

if(NOT DEFINED QS_VPETS_VERSION)
    if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../VERSION")
        file(READ "${CMAKE_CURRENT_SOURCE_DIR}/../VERSION" QS_VPETS_VERSION)
        string(STRIP "${QS_VPETS_VERSION}" QS_VPETS_VERSION)
    else()
        set(QS_VPETS_VERSION "0.11.0")
    endif()
endif()

string(REGEX MATCH "^[0-9]+(\\.[0-9]+)*" QS_VPETS_CMAKE_VERSION "${QS_VPETS_VERSION}")
if(NOT QS_VPETS_CMAKE_VERSION)
    set(QS_VPETS_CMAKE_VERSION "0.11.0")
endif()

project(qs-vpets-windows VERSION ${QS_VPETS_CMAKE_VERSION} LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

if(CMAKE_PREFIX_PATH AND NOT QT_ADDITIONAL_PACKAGES_PREFIX_PATH)
    set(QT_ADDITIONAL_PACKAGES_PREFIX_PATH "${CMAKE_PREFIX_PATH}")
endif()

find_package(Qt6 REQUIRED COMPONENTS Core Gui Network Qml Quick Svg)

get_filename_component(REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." ABSOLUTE)

set(QS_VPETS_VER_MAJOR "${PROJECT_VERSION_MAJOR}")
set(QS_VPETS_VER_MINOR "${PROJECT_VERSION_MINOR}")
set(QS_VPETS_VER_PATCH "${PROJECT_VERSION_PATCH}")
if(QS_VPETS_VER_MINOR STREQUAL "")
    set(QS_VPETS_VER_MINOR 0)
endif()
if(QS_VPETS_VER_PATCH STREQUAL "")
    set(QS_VPETS_VER_PATCH 0)
endif()

set(APP_ICON_PATH "${CMAKE_CURRENT_SOURCE_DIR}/AppIcon.ico")
configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/app.rc.in"
    "${CMAKE_CURRENT_BINARY_DIR}/app.rc"
    @ONLY
)

set(APP_SOURCES
    src/main.cpp
    src/QsCompat.h
    src/QsCompat.cpp
    src/WinPlatform.h
    src/WinPlatform.cpp
    "${CMAKE_CURRENT_BINARY_DIR}/app.rc"
)

if(MSVC)
    list(APPEND APP_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/app.manifest")
endif()

add_executable(qs-vpets-bin WIN32 ${APP_SOURCES})

target_compile_definitions(qs-vpets-bin PRIVATE
    QS_VPETS_VERSION_STR="${QS_VPETS_VERSION}"
    UNICODE
    _UNICODE
    NOMINMAX
    WIN32_LEAN_AND_MEAN
)

if(MSVC)
    target_compile_options(qs-vpets-bin PRIVATE /utf-8 /EHsc /W3)
endif()

include(CheckCXXSourceCompiles)
set(CMAKE_REQUIRED_FLAGS "/std:c++20 /EHsc")
set(CMAKE_REQUIRED_LIBRARIES "windowsapp")
check_cxx_source_compiles("
#include <unknwn.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.Control.h>
int main() { return 0; }
" HAS_WINRT_MEDIA_CONTROL)
unset(CMAKE_REQUIRED_FLAGS)
unset(CMAKE_REQUIRED_LIBRARIES)

set(WIN_LIBS
    dwmapi
    user32
    shell32
    ole32
    shcore
    advapi32
)
if(HAS_WINRT_MEDIA_CONTROL AND MSVC)
    target_compile_definitions(qs-vpets-bin PRIVATE QS_VPETS_HAS_WINRT_MEDIA=1)
    list(APPEND WIN_LIBS windowsapp)
endif()

target_link_libraries(qs-vpets-bin PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Network
    Qt6::Qml
    Qt6::Quick
    Qt6::Svg
    ${WIN_LIBS}
)

set_target_properties(qs-vpets-bin PROPERTIES
    OUTPUT_NAME "Pokemon Sanctuary"
)

# Stage the unified QML runtime + Windows overrides beside Pokemon Sanctuary.exe
set(STAGE_QML_DIR "$<TARGET_FILE_DIR:qs-vpets-bin>/qml")

add_custom_command(TARGET qs-vpets-bin POST_BUILD
    COMMAND "${CMAKE_COMMAND}" -E rm -rf "${STAGE_QML_DIR}"
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${STAGE_QML_DIR}"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${REPO_ROOT}/config" "${STAGE_QML_DIR}/config"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${REPO_ROOT}/components" "${STAGE_QML_DIR}/components"
    COMMAND "${CMAKE_COMMAND}" -E copy_directory "${REPO_ROOT}/assets" "${STAGE_QML_DIR}/assets"
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${STAGE_QML_DIR}/services"
    COMMAND "${CMAKE_COMMAND}" -E copy "${REPO_ROOT}/services/qmldir" "${STAGE_QML_DIR}/services/qmldir"
    COMMAND "${CMAKE_COMMAND}" -E copy "${REPO_ROOT}/services/PetManager.qml" "${STAGE_QML_DIR}/services/PetManager.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${REPO_ROOT}/services/VpetsIpc.qml" "${STAGE_QML_DIR}/services/VpetsIpc.qml"
    # Overlay Windows native QML implementations
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/shell.qml" "${STAGE_QML_DIR}/shell.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/services/WindowTracker.qml" "${STAGE_QML_DIR}/services/WindowTracker.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/services/InputTracker.qml" "${STAGE_QML_DIR}/services/InputTracker.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/services/MediaTracker.qml" "${STAGE_QML_DIR}/services/MediaTracker.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/services/SystemMonitor.qml" "${STAGE_QML_DIR}/services/SystemMonitor.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/components/PetWindow.qml" "${STAGE_QML_DIR}/components/PetWindow.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/components/SanctuaryWindow.qml" "${STAGE_QML_DIR}/components/SanctuaryWindow.qml"
    COMMENT "Staging Pokemon Sanctuary QML runtime and Windows resources"
)

install(TARGETS qs-vpets-bin
    RUNTIME DESTINATION "."
)
install(DIRECTORY "${STAGE_QML_DIR}"
    DESTINATION "."
)
install(FILES
    "${REPO_ROOT}/scripts/qs-vpets.ps1"
    "${REPO_ROOT}/scripts/qs-vpets.cmd"
    DESTINATION "bin"
)
