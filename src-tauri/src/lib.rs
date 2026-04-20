// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod commands;

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Suit Skills.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let icon = app.default_window_icon().cloned();
            if let Some(icon) = icon {
                TrayIconBuilder::with_id("main")
                    .tooltip("Suit Skills")
                    .icon(icon)
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }

            #[cfg(not(target_os = "windows"))]
            {
                use signal_hook::consts::TERM_SIGNALS;
                use signal_hook::iterator::Signals;
                let signals = Signals::new(TERM_SIGNALS).unwrap();
                std::thread::spawn(move || {
                    for signal in signals.forever() {
                        println!("Received termination signal: {:?}", signal);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::run_skill_command,
            commands::get_installed_skills,
            commands::get_skills_list,
            commands::install_skill,
            commands::remove_skill,
            commands::get_sources,
            commands::add_source,
            commands::remove_source,
            commands::update_source,
            commands::get_skill_detail,
            commands::export_skill,
            commands::get_install_targets,
            commands::add_install_target,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
