use serde::{Deserialize, Serialize};
use std::process::Command as StdCommand;
use tauri::{command, AppHandle};
use tauri_plugin_shell::ShellExt;

const SIDECAR_NAME: &str = "suit-skills";

/// 通用命令执行结果
#[derive(Debug, Serialize, Deserialize)]
pub struct SkillResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
    pub stdout: Option<String>,
}

/// 执行 suit-skills 命令
async fn run_cli_command(app: &AppHandle, args: Vec<String>) -> SkillResult {
    let output = app
        .shell()
        .sidecar(SIDECAR_NAME)
        .map(|command| command.args(&args))
        .map_err(|error| error.to_string());

    match output {
        Ok(command) => match command.output().await {
            Ok(result) => {
                let stdout = String::from_utf8_lossy(&result.stdout).to_string();
                let stderr = String::from_utf8_lossy(&result.stderr).to_string();

                if result.status.success() {
                    let data = if stdout.trim().starts_with('{') || stdout.trim().starts_with('[') {
                        serde_json::from_str(&stdout).ok()
                    } else {
                        None
                    };

                    SkillResult {
                        success: true,
                        data,
                        error: None,
                        stdout: Some(stdout),
                    }
                } else {
                    SkillResult {
                        success: false,
                        data: None,
                        error: Some(stderr),
                        stdout: Some(stdout),
                    }
                }
            }
            Err(error) => run_cli_command_fallback(&args, Some(error.to_string())),
        },
        Err(error) => run_cli_command_fallback(&args, Some(error)),
    }
}

fn run_cli_command_fallback(args: &[String], sidecar_error: Option<String>) -> SkillResult {
    let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let output = StdCommand::new("suit-skills").args(&args_str).output();

    match output {
        Ok(result) => {
            let stdout = String::from_utf8_lossy(&result.stdout).to_string();
            let stderr = String::from_utf8_lossy(&result.stderr).to_string();

            if result.status.success() {
                // 尝试解析 JSON 输出
                let data = if stdout.trim().starts_with('{') || stdout.trim().starts_with('[') {
                    serde_json::from_str(&stdout).ok()
                } else {
                    None
                };

                SkillResult {
                    success: true,
                    data,
                    error: None,
                    stdout: Some(stdout),
                }
            } else {
                SkillResult {
                    success: false,
                    data: None,
                    error: Some(stderr),
                    stdout: Some(stdout),
                }
            }
        }
        Err(e) => {
            // sidecar 失败时尝试使用 node 直接运行
            let node_output = StdCommand::new("node")
                .arg("dist/index.js")
                .args(&args_str)
                .output();

            match node_output {
                Ok(result) => {
                    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&result.stderr).to_string();

                    if result.status.success() {
                        let data = if stdout.trim().starts_with('{') || stdout.trim().starts_with('[') {
                            serde_json::from_str(&stdout).ok()
                        } else {
                            None
                        };

                        SkillResult {
                            success: true,
                            data,
                            error: None,
                            stdout: Some(stdout),
                        }
                    } else {
                        SkillResult {
                            success: false,
                            data: None,
                            error: Some(stderr),
                            stdout: Some(stdout),
                        }
                    }
                }
                Err(_) => SkillResult {
                    success: false,
                    data: None,
                    error: Some(format!(
                        "Failed to execute sidecar{}; global suit-skills failed: {}; node fallback failed",
                        sidecar_error
                            .map(|message| format!(": {}", message))
                            .unwrap_or_default(),
                        e
                    )),
                    stdout: None,
                },
            }
        }
    }
}

/// 运行任意 suit-skills 命令
#[command]
pub async fn run_skill_command(app: AppHandle, args: Vec<String>) -> SkillResult {
    run_cli_command(&app, args).await
}

/// 获取已安装技能列表
#[command]
pub async fn get_installed_skills(
    app: AppHandle,
    scope: Option<String>,
    target: Option<String>,
) -> SkillResult {
    let mut args: Vec<String> = vec!["installed".to_string(), "--json".to_string()];

    if let Some(s) = scope {
        if s == "global" {
            args.push("--global".to_string());
        } else if s == "all" || s == "project" {
            args.push("--scope".to_string());
            args.push(s);
        }
    }
    if let Some(t) = target {
        args.push("--env".to_string());
        args.push(t);
    }

    run_cli_command(&app, args).await
}

/// 获取技能库列表
#[command]
pub async fn get_skills_list(
    app: AppHandle,
    source: Option<String>,
    query: Option<String>,
    tag: Option<String>,
    refresh: Option<bool>,
) -> SkillResult {
    let mut args: Vec<String> = vec!["list".to_string(), "--json".to_string()];

    if let Some(s) = source {
        args.push("--source".to_string());
        args.push(s);
    }
    if let Some(q) = query {
        args.push("--query".to_string());
        args.push(q);
    }
    if let Some(t) = tag {
        args.push("--tag".to_string());
        args.push(t);
    }
    if refresh.unwrap_or(false) {
        args.push("--refresh".to_string());
    }

    run_cli_command(&app, args).await
}

/// 安装目标列表（与 Web UI 一致）
#[command]
pub async fn get_install_targets(app: AppHandle) -> SkillResult {
    run_cli_command(
        &app,
        vec![
            "targets".to_string(),
            "list".to_string(),
            "--json".to_string(),
        ],
    )
    .await
}

/// 添加自定义安装目标映射
#[command]
pub async fn add_install_target(
    app: AppHandle,
    id: String,
    global_dir: String,
    project_dir: String,
) -> SkillResult {
    run_cli_command(
        &app,
        vec![
            "targets".to_string(),
            "add".to_string(),
            id,
            "--global-dir".to_string(),
            global_dir,
            "--project-dir".to_string(),
            project_dir,
        ],
    )
    .await
}

/// 获取技能详情
#[command]
pub async fn get_skill_detail(app: AppHandle, name: String, source: Option<String>) -> SkillResult {
    let mut args: Vec<String> = vec!["info".to_string(), "--json".to_string(), name];

    if let Some(s) = source {
        args.push("--source".to_string());
        args.push(s);
    }

    run_cli_command(&app, args).await
}

/// 安装技能
#[command]
pub async fn install_skill(
    app: AppHandle,
    identifier: String,
    source: Option<String>,
    targets: Option<Vec<String>>,
    global: bool,
) -> SkillResult {
    let mut args: Vec<String> = vec!["install".to_string(), identifier];

    if let Some(s) = source {
        args.push("--source".to_string());
        args.push(s);
    }
    if let Some(t_list) = targets {
        if !t_list.is_empty() {
            args.push("--env".to_string());
            args.push(t_list.join(","));
        }
    }
    // `install` 子命令只有 `--local`（项目），省略则为全局；不要传 `--global`（会报错）
    if !global {
        args.push("--local".to_string());
    }

    run_cli_command(&app, args).await
}

/// 移除技能
#[command]
pub async fn remove_skill(
    app: AppHandle,
    name: String,
    target: Option<String>,
    scope: Option<String>,
) -> SkillResult {
    let mut args: Vec<String> = vec!["remove".to_string(), name];

    if let Some(t) = target {
        args.push("--env".to_string());
        args.push(t);
    }
    if let Some(s) = scope {
        if s == "global" {
            args.push("--global".to_string());
        }
    }

    run_cli_command(&app, args).await
}

/// 导出技能
#[command]
pub async fn export_skill(
    app: AppHandle,
    name: String,
    target: String,
    scope: String,
) -> SkillResult {
    let args: Vec<String> = vec![
        "export".to_string(),
        "--json".to_string(),
        name,
        "--target".to_string(),
        target,
        "--scope".to_string(),
        scope,
    ];
    run_cli_command(&app, args).await
}

/// 获取技能源列表
#[command]
pub async fn get_sources(app: AppHandle) -> SkillResult {
    run_cli_command(
        &app,
        vec!["source".to_string(), "list".to_string(), "--json".to_string()],
    )
    .await
}

/// 添加技能源
#[command]
pub async fn add_source(app: AppHandle, name: String, url: String) -> SkillResult {
    run_cli_command(
        &app,
        vec!["source".to_string(), "add".to_string(), name, url],
    )
    .await
}

/// 移除技能源
#[command]
pub async fn remove_source(app: AppHandle, name: String) -> SkillResult {
    run_cli_command(&app, vec!["source".to_string(), "remove".to_string(), name]).await
}

/// 更新技能源（启用/禁用）
#[command]
pub async fn update_source(app: AppHandle, name: String, enabled: bool) -> SkillResult {
    let action = if enabled { "enable" } else { "disable" };
    run_cli_command(
        &app,
        vec![
            "source".to_string(),
            action.to_string(),
            name,
        ],
    )
    .await
}
