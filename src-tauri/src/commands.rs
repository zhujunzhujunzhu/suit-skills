use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::command;

/// 通用命令执行结果
#[derive(Debug, Serialize, Deserialize)]
pub struct SkillResult {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
    pub stdout: Option<String>,
}

/// 获取 sidecar 可执行文件路径
fn get_sidecar_path() -> String {
    // 开发环境使用 node 运行 dist/index.js
    // 生产环境使用打包的 sidecar
    "suit-skills".to_string()
}

/// 执行 suit-skills 命令
fn run_cli_command(args: &[&str]) -> SkillResult {
    let sidecar = get_sidecar_path();

    // 尝试使用 sidecar 或直接调用 node
    let output = Command::new(&sidecar)
        .args(args)
        .output();

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
            let node_output = Command::new("node")
                .arg("dist/index.js")
                .args(args)
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
                    error: Some(format!("Failed to execute command: {}", e)),
                    stdout: None,
                },
            }
        }
    }
}

/// 运行任意 suit-skills 命令
#[command]
pub fn run_skill_command(args: Vec<String>) -> SkillResult {
    let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_cli_command(&args_str)
}

/// 获取已安装技能列表
#[command]
pub fn get_installed_skills(scope: Option<String>, target: Option<String>) -> SkillResult {
    let mut args: Vec<&str> = vec!["list", "--json"];

    if let Some(s) = scope {
        args.push("--scope");
        args.push(&s);
    }
    if let Some(t) = target {
        args.push("--target");
        args.push(&t);
    }

    run_cli_command(&args)
}

/// 获取技能库列表
#[command]
pub fn get_skills_list(source: Option<String>, query: Option<String>, tag: Option<String>) -> SkillResult {
    let mut args: Vec<&str> = vec!["search", "--json"];

    if let Some(s) = source {
        args.push("--source");
        args.push(&s);
    }
    if let Some(q) = query {
        args.push("--query");
        args.push(&q);
    }
    if let Some(t) = tag {
        args.push("--tag");
        args.push(&t);
    }

    run_cli_command(&args)
}

/// 获取技能详情
#[command]
pub fn get_skill_detail(name: String, source: Option<String>) -> SkillResult {
    let mut args: Vec<&str> = vec!["info", "--json", &name];

    if let Some(s) = source {
        args.push("--source");
        args.push(&s);
    }

    run_cli_command(&args)
}

/// 安装技能
#[command]
pub fn install_skill(
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
        for t in t_list {
            args.push("--target".to_string());
            args.push(t);
        }
    }
    if global {
        args.push("--global".to_string());
    }

    let args_str: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run_cli_command(&args_str)
}

/// 移除技能
#[command]
pub fn remove_skill(name: String, target: Option<String>, scope: Option<String>) -> SkillResult {
    let mut args: Vec<&str> = vec!["remove", &name];

    if let Some(t) = target {
        args.push("--target");
        args.push(&t);
    }
    if let Some(s) = scope {
        args.push("--scope");
        args.push(&s);
    }

    run_cli_command(&args)
}

/// 导出技能
#[command]
pub fn export_skill(name: String, target: String, scope: String) -> SkillResult {
    let args: Vec<&str> = vec!["export", "--json", &name, "--target", &target, "--scope", &scope];
    run_cli_command(&args)
}

/// 获取技能源列表
#[command]
pub fn get_sources() -> SkillResult {
    run_cli_command(&["source", "--json"])
}

/// 添加技能源
#[command]
pub fn add_source(name: String, url: String) -> SkillResult {
    run_cli_command(&["source", "add", &name, &url])
}

/// 移除技能源
#[command]
pub fn remove_source(name: String) -> SkillResult {
    run_cli_command(&["source", "remove", &name])
}

/// 更新技能源（启用/禁用）
#[command]
pub fn update_source(name: String, enabled: bool) -> SkillResult {
    let enabled_str = if enabled { "true" } else { "false" };
    run_cli_command(&["source", "update", &name, "--enabled", enabled_str])
}