#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rtmail-helper 自动部署脚本
使用 paramiko 进行 SSH 连接和文件传输
"""
import paramiko
import sys
import os
from getpass import getpass

# 设置输出编码
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

SERVER = "149.88.90.100"
USERNAME = "root"
REMOTE_DIR = "/opt/rtmail-helper"
PORT = 22

def deploy(password):
    """执行部署流程"""
    print("==> 连接到服务器...")

    # 创建 SSH 客户端
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(SERVER, port=PORT, username=USERNAME, password=password, timeout=10)
        print(f"✓ 已连接到 {SERVER}")

        # 创建 SFTP 客户端用于文件传输
        sftp = ssh.open_sftp()

        # 步骤 1: 备份数据库
        print("\n==> 步骤 1/5: 备份远程数据库")
        stdin, stdout, stderr = ssh.exec_command(
            f"cd {REMOTE_DIR} && cp -f data.db data.db.backup-$(date +%Y%m%d-%H%M%S) && echo 'Backup created'"
        )
        print(stdout.read().decode().strip())

        # 步骤 2: 上传文件
        print("\n==> 步骤 2/5: 上传核心代码文件")

        files_to_upload = [
            ("lib/mail.ts", f"{REMOTE_DIR}/lib/mail.ts"),
            ("lib/mail.test.ts", f"{REMOTE_DIR}/lib/mail.test.ts"),
            ("THROTTLE_FIX.md", f"{REMOTE_DIR}/THROTTLE_FIX.md"),
        ]

        for local_file, remote_file in files_to_upload:
            if os.path.exists(local_file):
                print(f"上传 {local_file}...")
                sftp.put(local_file, remote_file)
                print(f"  ✓ {local_file}")
            else:
                print(f"  ⚠ 跳过不存在的文件: {local_file}")

        sftp.close()

        # 步骤 3: 重新构建
        print("\n==> 步骤 3/5: 在服务器上重新构建")
        stdin, stdout, stderr = ssh.exec_command(f"cd {REMOTE_DIR} && npm run build 2>&1 | tail -20")
        output = stdout.read().decode()
        print(output)

        # 步骤 4: 重启服务
        print("\n==> 步骤 4/5: 重启服务")
        stdin, stdout, stderr = ssh.exec_command("systemctl restart rtmail-helper")
        stdout.channel.recv_exit_status()  # 等待命令完成
        print("✓ 服务已重启")

        # 步骤 5: 检查状态
        print("\n==> 步骤 5/5: 检查服务状态")
        stdin, stdout, stderr = ssh.exec_command("systemctl status rtmail-helper --no-pager | head -20")
        print(stdout.read().decode())

        print("\n" + "="*60)
        print("✅ 部署完成！")
        print("="*60)
        print(f"服务地址: https://outlook.rdmail.cn")
        print(f"\n查看实时日志:")
        print(f'  ssh {USERNAME}@{SERVER} \'journalctl -u rtmail-helper -f | grep "[imap]"\'')
        print(f"\n应该看到 'reusing pooled connection' 而不是频繁的 'opening new connection'")

    except paramiko.AuthenticationException:
        print(f"❌ 认证失败！请检查密码")
        return False
    except paramiko.SSHException as e:
        print(f"❌ SSH 连接错误: {e}")
        return False
    except Exception as e:
        print(f"❌ 部署失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        ssh.close()

    return True

if __name__ == "__main__":
    print("rtmail-helper 自动部署工具")
    print(f"目标服务器: {USERNAME}@{SERVER}")
    print("")

    # 从环境变量或命令行参数获取密码
    password = os.environ.get('SSH_PASSWORD')

    if not password and len(sys.argv) > 1:
        password = sys.argv[1]

    if not password:
        password = getpass("请输入服务器密码: ")

    if not password:
        print("❌ 未提供密码")
        sys.exit(1)

    success = deploy(password)
    sys.exit(0 if success else 1)
