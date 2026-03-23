const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;

const EXACT_TRANSLATIONS: Record<string, string> = {
  "About": "关于",
  "About Natively": "关于 Natively",
  "Active Model": "当前模型",
  "Activity Monitor": "活动监视器",
  "Add API keys in Settings.": "请先在设置中添加 API Key。",
  "Add API keys to unlock cloud AI models.": "在设置中添加 API Key 后即可启用云端 AI 模型。",
  "Add Provider": "添加提供商",
  "Add your own AI endpoints via cURL.": "通过 cURL 添加你自己的 AI 接口。",
  "Advanced Settings": "高级设置",
  "AI Providers": "AI 提供商",
  "AI Response Language": "AI 回复语言",
  "Analysis": "分析",
  "Answer": "回答",
  "Answer / Record": "回答 / 录音",
  "Applies to new chats instantly.": "会立即应用到新聊天中。",
  "Ask a question or click Answer": "输入问题或点击“回答”",
  "Ask about this meeting...": "询问这场会议...",
  "Ask anything on screen or conversation": "可以问屏幕内容或当前对话里的任何问题",
  "Ask anything on screen or conversation, or": "可以问屏幕内容或当前对话里的任何问题，或者",
  "Ask me anything...": "想问什么都可以...",
  "Attempting to auto-fix connection...": "正在尝试自动修复连接...",
  "Audio": "音频",
  "Audio Configuration": "音频设置",
  "Audio Result": "音频结果",
  "Audio Result:": "音频结果：",
  "Auto-Fix Connection": "自动修复连接",
  "Available Variables": "可用变量",
  "Azure Speech": "Azure Speech",
  "BETA": "测试版",
  "Built by one.": "一人打造。",
  "Calendar": "日历",
  "Calendar Connected": "日历已连接",
  "Calendar linked": "日历已关联",
  "Cancel": "取消",
  "Capture additional parts of the question or your solution for debugging help. Up to 5 extra screenshots are saved.": "可额外截图保存题目的其他部分或你的解法，便于进一步分析。最多保留 5 张附加截图。",
  "Chat": "聊天",
  "Check for updates": "检查更新",
  "Check Settings.": "请检查设置。",
  "Checking for Ollama...": "正在检查 Ollama...",
  "Checking...": "正在检查...",
  "Choose the engine that transcribes audio to text.": "选择将语音转成文字所使用的引擎。",
  "Click ⚙️ Models to switch AI providers": "点击“⚙️ 模型”可切换 AI 提供商",
  "Close": "关闭",
  "Cloud": "云端",
  "Cloud Providers": "云端提供商",
  "Code Comparison": "代码对比",
  "Code Solution": "代码解法",
  "Combined System + Context + Message (Recommended)": "合并 System + Context + Message（推荐）",
  "Community": "社区",
  "Configuration Guide": "配置指南",
  "Connected": "已连接",
  "Contact Me": "联系我",
  "Copied": "已复制",
  "Copy": "复制",
  "Copy to clipboard": "复制到剪贴板",
  "Core Technology": "核心技术",
  "Core settings for Natively.": "Natively 的核心设置。",
  "Creator": "创建者",
  "Custom": "自定义",
  "Custom Providers": "自定义提供商",
  "Custom Search Engine ID": "自定义搜索引擎 ID",
  "Customize how Natively looks on your device": "自定义 Natively 在设备上的外观表现",
  "Customize how Natively works for you": "自定义 Natively 为你工作的方式",
  "Dark": "深色",
  "Debug": "调试",
  "Default Microphone": "默认麦克风",
  "Default Model for Chat": "聊天默认模型",
  "Default Speakers": "默认扬声器",
  "Delete": "删除",
  "Delete screenshot": "删除截图",
  "Designed to be invisible, intelligent, and trusted.": "为低存在感、聪明且可靠的体验而设计。",
  "Disconnect": "断开连接",
  "Disguise Natively as another application to prevent detection during screen sharing.": "将 Natively 伪装成其他应用，以减少屏幕共享时被发现的概率。",
  "Dismiss": "知道了",
  "Donate": "支持一下",
  "Dot notation path to the answer text in the JSON response. If empty, the full JSON is returned.": "在 JSON 响应中指向答案文本的点号路径；留空时将返回完整 JSON。",
  "Downloading Update...": "正在下载更新...",
  "Draft Follow-up": "起草跟进邮件",
  "Drafting perfect follow-up...": "正在生成跟进邮件...",
  "Edit": "编辑",
  "Ensure Ollama is running (`ollama serve`).": "请确认 Ollama 已启动（`ollama serve`）。",
  "Ensure Ollama is running.": "请确认 Ollama 正在运行。",
  "Error": "错误",
  "Error: Electron API not initialized. Check preload script.": "错误：Electron API 尚未初始化，请检查 preload 脚本。",
  "Events synced": "事件已同步",
  "Examples": "示例",
  "Experimental": "实验性",
  "Explore": "探索",
  "Export": "导出",
  "Extracting problem statement...": "正在提取题目内容...",
  "Fast Response": "极速回复",
  "Fast Response Mode": "极速回复模式",
  "Features \"Undetectable Mode\" to hide from the dock and \"Masquerading\" to disguise as system apps. You control exactly what data leaves your device.": "提供“Undetectable Mode”隐藏坞站图标，并可通过“Masquerading”伪装成系统应用。离开你设备的数据始终由你掌控。",
  "Fetch Models": "获取模型列表",
  "Fetching...": "正在获取...",
  "Finalizing...": "正在收尾...",
  "Follow Up": "跟进",
  "Follow Up Question": "追问问题",
  "Follow-Up Questions": "追问问题",
  "Found a bug? Let us know so we can fix it.": "如果你发现了 bug，告诉我们，我们会尽快修复。",
  "Fully Visible": "完全可见",
  "Fund development": "支持开发",
  "Gemini 3 Flash": "Gemini 3 Flash",
  "General": "常规",
  "General Configuration": "常规配置",
  "General settings": "常规设置",
  "Generate a solution based on the current problem.": "根据当前题目生成解答。",
  "Generate new solutions based on all previous and newly added screenshots.": "结合之前和新添加的截图重新生成解答。",
  "Generated from audio input": "根据语音输入生成",
  "Generating suggestion...": "正在生成建议...",
  "Get API Key": "获取 API 密钥",
  "Get in Touch": "联系我",
  "Get Key": "获取密钥",
  "Get Recap": "生成总结",
  "Get started by connecting a Google account.": "连接 Google 账号后即可开始使用。",
  "Google Calendar": "Google 日历",
  "Google Search API": "Google 搜索 API",
  "Google Speech-to-Text Key (JSON)": "Google 语音识别密钥（JSON）",
  "Groq Whisper": "Groq Whisper",
  "Hide": "隐藏",
  "Hiring Strategy": "招聘策略",
  "Hold the slider to preview.": "按住滑块即可预览效果。",
  "How Natively Works": "Natively 的工作方式",
  "Hybrid Intelligence": "混合智能",
  "I build software that stays out of the way.": "我想做的是不打扰用户的软件。",
  "IBM Watson": "IBM Watson",
  "IBM Watson Speech-to-Text cloud service": "IBM Watson 云端语音转文字服务",
  "If macOS says \"App is damaged\"": "如果 macOS 提示“App is damaged”",
  "If not provided, LLM general knowledge is used for company research, which may be outdated. Get your API key from the": "如果不提供，公司研究会退回使用 LLM 的通用知识，信息可能过时。你可以在这里获取 API 密钥：",
  "Includes performance improvements and bug fixes.": "本次更新包含性能优化和问题修复。",
  "Input Level": "输入电平",
  "Instant intelligent retrieval of context directly during a live meeting using local vectors.": "在实时会议过程中，基于本地向量即时检索上下文信息。",
  "Interface Opacity": "界面透明度",
  "Interview Focus": "面试重点",
  "Interviewer": "面试官",
  "Interviewer Transcript": "面试官转录",
  "Keyboard Shortcuts": "键盘快捷键",
  "Keyboard shortcuts": "键盘快捷键",
  "Keybinds": "快捷键绑定",
  "Language for AI suggestions and notes": "AI 建议和笔记的语言",
  "Light": "浅色",
  "Link your calendar to": "关联你的日历，以便",
  "Listening...": "正在聆听...",
  "Live Meeting RAG": "实时会议 RAG",
  "Loading code comparison...": "正在加载代码对比...",
  "Loading models...": "正在加载模型...",
  "Loading solutions...": "正在生成解答...",
  "Local": "本地",
  "Local (Ollama)": "本地（Ollama）",
  "Local Models (Ollama)": "本地模型（Ollama）",
  "Local RAG & Memory": "本地 RAG 与记忆",
  "Love Natively? Support us by starring the repo.": "如果你喜欢 Natively，欢迎给仓库点个 Star 支持我们。",
  "Manage in Settings": "前往设置管理",
  "Manage input and output devices.": "管理输入与输出设备。",
  "Meeting Link Found": "已找到会议链接",
  "Microsoft Azure Cognitive Services STT": "Microsoft Azure Cognitive Services 语音转文字",
  "More Stealth": "更强隐蔽性",
  "Move Window Down": "窗口下移",
  "Move Window Left": "窗口左移",
  "Move Window Right": "窗口右移",
  "Move Window Up": "窗口上移",
  "Move app to Applications folder, then run:": "先把应用移动到 Applications 文件夹，然后执行：",
  "My Custom LLM": "我的自定义 LLM",
  "My Natively": "我的 Natively",
  "NEW": "新",
  "Natively": "Natively",
  "Natively is built and maintained by one developer.": "Natively 由一位开发者独立构建和维护。",
  "Natively is independent open-source software.": "Natively 是一个独立的开源项目。",
  "Natively listens only when active. It does not record video, take arbitrary screenshots without command, or perform background surveillance.": "Natively 仅在激活时监听，不会录制视频、不会在未授权时随意截图，也不会进行后台监视。",
  "Natively will open automatically when you log in to your computer": "登录电脑后会自动启动 Natively",
  "Natively works with these easy to remember commands.": "Natively 支持这些容易记住的快捷操作。",
  "New Version": "新版本",
  "No calendars": "暂无日历",
  "No cloud providers configured.": "还没有配置云端提供商。",
  "No custom providers added yet.": "还没有添加自定义提供商。",
  "No custom providers.": "还没有自定义提供商。",
  "No devices found": "未找到设备",
  "No file selected": "未选择文件",
  "No models available": "暂无可用模型",
  "No models connected.": "当前没有可用模型。",
  "No Ollama models found.": "未找到 Ollama 模型。",
  "No recent meetings.": "最近还没有会议记录。",
  "No Recording": "不录制",
  "No transcript available.": "暂无转录内容。",
  "No usage history.": "暂无使用记录。",
  "None (Default)": "无（默认）",
  "Not now": "暂时不用",
  "Not Now": "暂时不用",
  "Official Website": "官网",
  "Ollama connected": "Ollama 已连接",
  "Ollama is running but no models found. Run `ollama pull llama3` to get started.": "Ollama 已启动，但尚未发现模型。可以先运行 `ollama pull llama3` 开始使用。",
  "Ollama not detected": "未检测到 Ollama",
  "Open Natively when you log in": "登录后自动打开 Natively",
  "Open for professional collaborations and job offers.": "欢迎商务合作和工作机会联系。",
  "OpenAI Compatible": "OpenAI 兼容",
  "OpenAI Whisper": "OpenAI Whisper",
  "Parsing JD structure...": "正在解析 JD 结构...",
  "Persona Engine": "画像引擎",
  "Powers live web search for company research.": "用于公司研究时的实时网页搜索。",
  "Premium Profile Intelligence": "高级职业画像",
  "Prepare": "提前准备",
  "Previous Version": "旧版本",
  "Primary model for new chats. Other configured models act as fallbacks.": "新聊天默认使用的主模型，其它已配置模型会作为回退。",
  "Privacy & Data": "隐私与数据",
  "Process Disguise": "进程伪装",
  "Process Screenshots": "处理截图",
  "Processing structural semantics...": "正在分析结构语义...",
  "Profile Intelligence": "职业画像",
  "Profile Mode": "档案模式",
  "Provider Changed": "提供商已切换",
  "Provider Name": "提供商名称",
  "Quit Natively": "退出 Natively",
  "READY TO JOIN": "准备加入",
  "Re-index automatically": "自动重新索引",
  "Real-time streaming transcription via Deepgram WebSocket": "通过 Deepgram WebSocket 实现实时流式转写",
  "Recap": "总结",
  "Recipient email": "收件人邮箱",
  "Recognition Language (STT)": "识别语言（STT）",
  "Recommended": "推荐",
  "Record": "录音",
  "Refresh Ollama": "刷新 Ollama",
  "Refresh State": "刷新状态",
  "Refreshed": "已刷新",
  "Regenerate": "重新生成",
  "Region": "区域",
  "Reload UI": "重新加载界面",
  "Remove": "移除",
  "Remove API Key": "移除 API 密钥",
  "Remove CSE ID": "移除 CSE ID",
  "Report an Issue": "反馈问题",
  "Required for Google Cloud Speech-to-Text.": "使用 Google Cloud 实时识别时必填。",
  "Required for accurate speech recognition.": "为了保证识别准确度，此项为必填。",
  "Requires a Groq API Key to be configured below.": "需要先在下方配置 Groq API 密钥。",
  "Reset": "重置",
  "Reset / Cancel": "重置 / 取消",
  "Response JSON Path": "响应 JSON 路径",
  "Restart & Install": "重启并安装",
  "Restore Default": "恢复默认",
  "Run open-source models locally.": "在本地运行开源模型。",
  "Save": "保存",
  "Save Provider": "保存提供商",
  "Say \"rephrase that\" or \"make it shorter\" for follow-ups": "可以说“换种说法”或“说短一点”来继续追问",
  "Say this": "你可以这样说",
  "Screenshot": "截图",
  "Screenshot attached": "已附加截图",
  "Screenshot data (if available)": "截图数据（如有）",
  "Scribe v2 Realtime API": "Scribe v2 Realtime API",
  "Scroll Down": "向下滚动",
  "Scroll Up": "向上滚动",
  "Search all meetings": "搜索所有会议",
  "Search for": "搜索",
  "Search or ask anything...": "搜索或随时提问...",
  "Search this meeting": "搜索当前会议",
  "Select File": "选择文件",
  "Select Language": "选择语言",
  "Select Provider": "选择提供商",
  "Select Region": "选择区域",
  "Select a disguise to be automatically applied when Undetectable mode is on.": "选择在开启 Undetectable mode 时自动启用的伪装方式。",
  "Select area": "选择区域",
  "Select the primary language being spoken in the meeting.": "选择会议中主要使用的语言。",
  "Selective Screenshot": "区域截图",
  "Send": "发送",
  "Service Account JSON": "服务账号 JSON",
  "Settings": "设置",
  "Shorten": "精简",
  "Shortened": "已精简",
  "Show or hide this window.": "显示或隐藏这个窗口。",
  "Show real-time transcription of the interviewer": "显示面试官的实时转录",
  "Show/Hide": "显示/隐藏",
  "Sign Out": "退出登录",
  "So how would you optimize the current algorithm?": "那你会怎么优化当前这个算法？",
  "Solve": "解题",
  "Solve Problem": "解决题目",
  "Soniox": "Soniox",
  "Soniox & Multilingual": "Soniox 与多语言",
  "Space:": "空间：",
  "Speech Provider": "语音提供商",
  "Star on GitHub": "在 GitHub 上点 Star",
  "Start Meeting": "开始会议",
  "Start Natively": "启动 Natively",
  "Start Over": "重新开始",
  "Start fresh with a new question.": "用一个新问题重新开始。",
  "Start now": "现在开始",
  "Start over": "重新开始",
  "Stealth & Control": "隐蔽与掌控",
  "Stop": "停止",
  "Subject": "主题",
  "Subject line": "邮件主题",
  "Suggestion": "建议",
  "Super fast responses using Groq Llama 3 for text. Multimodal requests still use your Default Model.": "文本场景下会优先使用 Groq Llama 3 提供更快回复；多模态请求仍使用你的默认模型。",
  "Support Development": "支持开发",
  "Support Project": "支持项目",
  "Support the Builder": "支持开发者",
  "Supported apps here": "支持的应用见此处",
  "Synced with calendar": "已与日历同步",
  "System": "跟随系统",
  "System Settings": "系统设置",
  "Take Screenshot": "截图",
  "Take a screenshot (Cmd+H) for automatic analysis": "截图（Cmd+H）后可自动分析",
  "Take a screenshot of the problem description. The tool will extract and analyze the problem. The 5 latest screenshots are saved.": "对题目描述进行截图，工具会自动提取并分析内容，并保存最近 5 张截图。",
  "Terminal": "终端",
  "Test Connection": "测试连接",
  "Test Sound": "测试声音",
  "Testing...": "正在测试...",
  "The language in which the AI will provide its suggestions.": "AI 输出建议时所使用的语言。",
  "The language you and the interviewer are speaking.": "你和面试官当前交流所使用的语言。",
  "Theme": "主题",
  "This engine constructs an intelligent representation of your career history.": "这个引擎会构建你职业经历的智能画像。",
  "This key is separate from your main AI Provider key.": "这个 Key 与主 AI Provider Key 是分开的。",
  "Time:": "时间：",
  "To": "收件人",
  "Toggle Visibility": "显示/隐藏/置前窗口",
  "Toggle Window": "显示/隐藏/置前窗口",
  "Show / Hide / Focus Window": "显示/隐藏/置前窗口",
  "Transcript": "转录",
  "Transcription via OpenAI Whisper API": "通过 OpenAI Whisper API 转录",
  "Try to recover": "尝试恢复",
  "Type a key point...": "输入一个关键要点...",
  "Type an action item...": "输入一个行动项...",
  "Type your message...": "输入你的消息...",
  "Ultra-fast streaming STT with Soniox. Set speech recognition specific to accents, dialects, and varied AI response languages.": "使用 Soniox 实现超快流式 STT，可针对口音、方言做识别优化，并支持不同的 AI 回复语言。",
  "Ultra-fast transcription via Groq API": "通过 Groq API 进行超快转录",
  "Up Next": "即将开始",
  "Up to date": "已是最新",
  "Upcoming features": "即将上线",
  "Upcoming meetings are synchronized from these calendars": "接下来的会议会从这些日历中同步",
  "Update Available": "发现新版本",
  "Update Now": "立即更新",
  "Upload a JD to enable persona tuning and company research.": "上传 JD 后即可启用画像调优和公司研究。",
  "Upload your Resume & Job Description for hyper-personalized interview assistance, company research, and salary negotiation tactics.": "上传你的简历和职位描述后，可获得更贴合个人情况的面试辅助、公司研究和薪资谈判建议。",
  "Use the ScreenCaptureKit backend. An optimized alternative to CoreAudio if you experience any capture issues.": "启用 ScreenCaptureKit 后端。如果你遇到音频采集问题，它会是比 CoreAudio 更稳妥的替代方案。",
  "Used by thousands.": "已有成千上万用户在使用。",
  "Uses gRPC streaming via Google Cloud Service Account": "通过 Google Cloud Service Account 使用 gRPC 流式传输",
  "V3": "V3",
  "V3 Turbo": "V3 Turbo",
  "Version": "版本",
  "Visible Calendars": "可见日历",
  "Visit Website": "访问官网",
  "What I Changed": "我改了哪些内容",
  "What to Answer": "怎么回答",
  "What to answer?": "怎么回答？",
  "What's New in v2.0": "v2.0 新内容",
  "Whisper Large V3 (Most Accurate)": "Whisper Large V3（最准确）",
  "Whisper Large V3 Turbo (Fastest)": "Whisper Large V3 Turbo（最快）",
  "Whisper Model": "Whisper 模型",
  "Window": "窗口",
  "Write your email...": "写下你的邮件内容...",
  "and create a Custom Search Engine at": "并在这里创建 Custom Search Engine：",
  "for selective screenshot": "再进行区域截图",
  "is made to feel fast, quiet, and respectful of your privacy.": "追求的是快速、安静，并充分尊重你的隐私。",
  "it moving forward.": "让这个项目继续走下去。",
  "listening...": "正在聆听...",
  "or": "或",
  "see upcoming events": "查看即将到来的日程",
  "to cancel": "可取消",
  "✓ Saved": "✓ 已保存",
  "● Stop Recording": "● 停止录音",
  "🎤 Record Voice": "🎤 录音输入",
  "💡 Suggested Response": "💡 建议回复",
  "💬 Chat": "💬 聊天",
  "⚙️ Models": "⚙️ 模型",
  "Answers, tailored to you": "更懂你的回答建议",
  "Built openly and sustained by users": "公开构建，由用户持续支持",
  "Contribute to development": "支持开发",
  "Development driven by real users": "功能方向来自真实用户需求",
  "Designed to work silently during live interviews.": "专为实时面试中的低存在感使用体验而设计。",
  "Faster iteration on features that matter": "更快打磨真正重要的功能",
  "If it’s part of your daily workflow, your support keeps": "如果它已经成了你日常工作流程的一部分，你的支持会让",
  "Interested": "感兴趣",
  "Link Ready": "链接已就绪",
  "Mark interest": "标记感兴趣",
  "Repo aware explanations": "结合仓库上下文的讲解",
  "Support development": "支持开发",
  "System design interview specialization": "系统设计面试专项能力",
  "⚠️ Disable Undetectable mode first to change disguise.": "请先关闭 Undetectable mode，再修改伪装样式。",
  "An unexpected error occurred. Your data is safe — click below to recover.": "发生了意外错误。你的数据仍然安全，点击下方即可恢复。",
  "Calculating complexity...": "正在计算复杂度...",
  "Company Intel:": "公司情报：",
  "Complexity (Updated)": "复杂度（已更新）",
  "cURL Command": "cURL 命令",
  "e.g. choices[0].message.content": "例如 choices[0].message.content",
  "e.g. eastus": "例如 eastus",
  "e.g. eastus, westeurope, westus2": "例如 eastus、westeurope、westus2",
  "English (Australia)": "英语（澳大利亚）",
  "English (Canada)": "英语（加拿大）",
  "English (India)": "英语（印度）",
  "English (United Kingdom)": "英语（英国）",
  "English (United States)": "英语（美国）",
  "Google Cloud Console": "Google Cloud Console",
  "Connected as": "当前连接账号：",
  "User": "用户",
  "system": "跟随系统",
  "light": "浅色",
  "dark": "深色",
  "Alternative": "备选",
  "Competitors": "竞品",
  "Experience": "经验",
  "Projects": "项目",
  "Nodes": "节点",
  "Enter Google API key": "输入 Google API Key",
  "Enter CSE ID (cx)": "输入 CSE ID（cx）",
  "Requires Pro license": "需要 Pro 许可证",
  "Professional Identity": "职业画像",
  "Provide a resume file to seed the intelligence engine.": "上传简历文件，为智能引擎提供基础资料。",
  "SCK Backend": "SCK 后端",
  "Salary Estimates": "薪资估算",
  "Top Skills": "核心技能",
  "Enter Groq API key": "输入 Groq API Key",
  "Enter OpenAI STT API key": "输入 OpenAI STT API Key",
  "Enter ElevenLabs API key": "输入 ElevenLabs API Key",
  "Enter Azure API key": "输入 Azure API Key",
  "Enter IBM Watson API key": "输入 IBM Watson API Key",
  "Enter Soniox API key": "输入 Soniox API Key",
  "Enter Deepgram API key": "输入 Deepgram API Key",
  "Input Device": "输入设备",
  "Output Device": "输出设备",
  "Language": "语言",
  "Accent / Region": "口音 / 地区",
  "Research complete": "研究已完成",
  "Researching...": "研究中...",
  "Research Now": "立即研究",
};

const DYNAMIC_TRANSLATIONS: Array<{
  pattern: RegExp;
  replace: (...args: string[]) => string;
}> = [
  {
    pattern: /^Get (.+) API Key$/,
    replace: (_match, providerName) => `获取 ${providerName} API Key`,
  },
  {
    pattern: /^Model fetch error:\s*(.+)$/,
    replace: (_match, detail) => `模型获取失败：${detail}`,
  },
  {
    pattern: /^Device ([^.]+)\.\.\.$/,
    replace: (_match, deviceId) => `设备 ${deviceId}...`,
  },
  {
    pattern: /^(\d+)% Complete$/,
    replace: (_match, progress) => `已完成 ${progress}%`,
  },
];

const SKIP_TRANSLATION_SELECTOR = [
  "script",
  "style",
  "textarea",
  "input[type='text']",
  "input[type='email']",
  "input[type='search']",
  "code",
  "pre",
  "kbd",
  "[contenteditable='true']",
].join(", ");

let isInitialized = false;

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const preserveWhitespace = (original: string, translated: string) => {
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
};

const translateValue = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const exact = EXACT_TRANSLATIONS[normalized];
  if (exact) {
    return preserveWhitespace(value, exact);
  }

  for (const translation of DYNAMIC_TRANSLATIONS) {
    const matched = normalized.match(translation.pattern);
    if (matched) {
      return preserveWhitespace(value, translation.replace(...matched));
    }
  }

  return null;
};

const shouldSkipTextNode = (node: Text) => {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest(SKIP_TRANSLATION_SELECTOR));
};

const translateTextNode = (node: Text) => {
  if (shouldSkipTextNode(node)) return;

  const original = node.textContent ?? "";
  const translated = translateValue(original);

  if (translated && translated !== original) {
    node.textContent = translated;
  }
};

const translateAttributes = (element: Element) => {
  if (element.closest("code, pre, kbd")) return;

  TRANSLATABLE_ATTRIBUTES.forEach((attribute) => {
    const original = element.getAttribute(attribute);
    if (!original) return;

    const translated = translateValue(original);
    if (translated && translated !== original) {
      element.setAttribute(attribute, translated);
    }
  });
};

const translateSubtree = (root: Node) => {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }

  if (root instanceof Element) {
    translateAttributes(root);
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
  );

  let currentNode = walker.nextNode();
  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      translateTextNode(currentNode as Text);
    } else if (currentNode instanceof Element) {
      translateAttributes(currentNode);
    }
    currentNode = walker.nextNode();
  }
};

export const initUiLocalization = () => {
  if (isInitialized || typeof window === "undefined" || !document.body) {
    return;
  }

  isInitialized = true;
  document.documentElement.lang = "zh-CN";
  translateSubtree(document.body);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
        translateTextNode(mutation.target as Text);
        return;
      }

      if (mutation.type === "attributes" && mutation.target instanceof Element) {
        translateAttributes(mutation.target);
      }

      mutation.addedNodes.forEach((node) => {
        translateSubtree(node);
      });
    });
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
  });
};
