新版智能问数独立部署包

目标目录：
  /data/ocr/intelligent-data

首次部署：
  1. 将本目录全部上传到 /data/ocr/intelligent-data
  2. 将 .env.example 复制为 .env，并填写平台和历史数据库连接信息
  3. 使用历史服务账号执行 backend/init_history.sql
  4. 执行 pip install -r backend/requirements.txt
  5. 执行 chmod +x start.sh
  6. 执行 ./start.sh，确认服务监听 8091
  7. 将 nginx.conf 中的 server 配置合并到服务器现有 Nginx 配置
  8. 执行 nginx -t，确认通过后再重载 Nginx

目录说明：
  frontend/dist  生产前端静态文件
  backend        新版智能问数独立适配服务和独立历史服务
  backend/init_history.sql  influenza_surveillance 库历史表建表脚本
  logs           运行日志目录

本项目不导入 chat_app 代码，仅通过 HTTP/SSE 调用工作流 242。
当前无登录页面，所有访问者共享固定后端账号下的历史记录。
历史元数据写入 influenza_surveillance.intelligent_data_history；
HTML/PDF报告存放OSS，历史表只保存URL。
