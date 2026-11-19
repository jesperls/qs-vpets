cmake_minimum_required(VERSION 3.22)

if(NOT DEFINED QS_VPETS_VERSION)
    if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../VERSION")
        file(READ "${CMAKE_CURRENT_SOURCE_DIR}/../VERSION" QS_VPETS_VERSION)
        string(STRIP "${QS_VPETS_VERSION}" QS_VPETS_VERSION)
    else()
        set(QS_VPETS_VERSION "0.10.0")
    endif()
endif()

string(REGEX MATCH "^[0-9]+(\\.[0-9]+)*" QS_VPETS_CMAKE_VERSION "${QS_VPETS_VERSION}")
if(NOT QS_VPETS_CMAKE_VERSION)
    set(QS_VPETS_CMAKE_VERSION "0.10.0")
endif()

project(qs-vpets-macos VERSION ${QS_VPETS_CMAKE_VERSION} LANGUAGES CXX OBJCXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_OBJCXX_STANDARD 20)
set(CMAKE_OBJCXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

if(CMAKE_PREFIX_PATH AND NOT QT_ADDITIONAL_PACKAGES_PREFIX_PATH)
    set(QT_ADDITIONAL_PACKAGES_PREFIX_PATH "${CMAKE_PREFIX_PATH}")
endif()

find_package(Qt6 REQUIRED COMPONENTS Core Gui Network Qml Quick)

get_filename_component(REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." ABSOLUTE)

set(BUNDLE_NAME "Pokemon Sanctuary")
set(MACOSX_BUNDLE_EXECUTABLE_NAME "${BUNDLE_NAME}")

add_executable(qs-vpets-bin MACOSX_BUNDLE
    src/main.mm
    src/QsCompat.h
    src/QsCompat.cpp
    src/MacPlatform.h
    src/MacPlatform.mm
)

target_compile_definitions(qs-vpets-bin PRIVATE
    QS_VPETS_VERSION_STR="${QS_VPETS_VERSION}"
)

target_compile_options(qs-vpets-bin PRIVATE
    $<$<COMPILE_LANGUAGE:OBJCXX>:-fobjc-arc>
)

target_link_libraries(qs-vpets-bin PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Network
    Qt6::Qml
    Qt6::Quick
    "-framework AppKit"
    "-framework Carbon"
    "-framework CoreGraphics"
    "-framework CoreAudio"
    "-framework AudioToolbox"
    "-framework IOKit"
)

set_target_properties(qs-vpets-bin PROPERTIES
    OUTPUT_NAME "${BUNDLE_NAME}"
    MACOSX_BUNDLE_EXECUTABLE_NAME "${MACOSX_BUNDLE_EXECUTABLE_NAME}"
    MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/Info.plist.in"
)

# Stage the unified QML runtime + macOS overrides into Pokémon Sanctuary.app/Contents/Resources/qml
set(BUNDLE_RES_DIR "$<TARGET_BUNDLE_CONTENT_DIR:qs-vpets-bin>/Resources")
set(STAGE_QML_DIR "${BUNDLE_RES_DIR}/qml")

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
    # Overlay macOS native QML implementations
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/shell.qml" "${STAGE_QML_DIR}/shell.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/services/WindowTracker.qml" "${STAGE_QML_DIR}/services/WindowTracker.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/services/InputTracker.qml" "${STAGE_QML_DIR}/services/InputTracker.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/services/MediaTracker.qml" "${STAGE_QML_DIR}/services/MediaTracker.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/services/SystemMonitor.qml" "${STAGE_QML_DIR}/services/SystemMonitor.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/components/PetWindow.qml" "${STAGE_QML_DIR}/components/PetWindow.qml"
    COMMAND "${CMAKE_COMMAND}" -E copy "${CMAKE_CURRENT_SOURCE_DIR}/qml/components/SanctuaryWindow.qml" "${STAGE_QML_DIR}/components/SanctuaryWindow.qml"
    COMMAND "${CMAKE_CURRENT_SOURCE_DIR}/build-icns.sh" "${REPO_ROOT}/packaging/desktop/qs-vpets.svg" "${BUNDLE_RES_DIR}/AppIcon.icns"
    COMMENT "Staging Pokémon Sanctuary QML runtime and macOS bundle resources"
)

install(TARGETS qs-vpets-bin
    BUNDLE DESTINATION "Applications"
)

install(PROGRAMS "${REPO_ROOT}/scripts/qs-vpets-macos.sh"
    DESTINATION "bin"
    RENAME "qs-vpets"
)
