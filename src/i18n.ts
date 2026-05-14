export type Language = 'en' | 'zh';

let currentLang: Language = 'en';

export function setLanguage(lang: Language): void {
	currentLang = lang;
}

export function getLanguage(): Language {
	return currentLang;
}

const translations: Record<Language, Record<string, string>> = {
	en: {
		// Common
		'common.save': 'Save',
		'common.cancel': 'Cancel',
		'common.open': 'Open {name}',
		'common.remove': 'Remove {name}',

		// Settings
		'settings.dashboardFile': 'Dashboard file',
		'settings.dashboardFileDesc': 'Full path to the dashboard file (e.g. dashboard or notes/dashboard). Omit .md extension.',
		'settings.theme': 'Theme',
		'settings.themeDesc': 'Dashboard color theme',
		'settings.themeAuto': 'Auto',
		'settings.themeLight': 'Light',
		'settings.themeDark': 'Dark',
		'settings.recentCount': 'Recent documents count',
		'settings.recentCountDesc': 'Number of recent documents to show in the sidebar',
		'settings.language': 'Language',
		'settings.languageDesc': 'Interface language',
		'settings.languageEn': 'English',
		'settings.languageZh': '中文',

		// Style Presets
		'settings.stylePreset': 'Style',
		'settings.stylePresetDesc': 'Dashboard visual style preset',
		'settings.styleEarth': 'Earth',
		'settings.styleNordic': 'Nordic',
		'settings.styleNeon': 'Cyan',
		'settings.styleAurora': 'Aurora',
		'settings.stylePrism': 'Spring',
				
		// Main
		'main.openDashboard': 'Open dashboard',
		'main.dashboard': 'Dashboard',

		// Renderer
		'renderer.addSection': '+ Add section',
		'renderer.sectionName': 'Section name:',
		'renderer.addCardTo': 'Add card to {column}',
		'renderer.editCard': 'Edit card',
		'renderer.deleteCard': 'Delete card',
		'renderer.moveUp': 'Move up',
		'renderer.moveDown': 'Move down',
		'renderer.deleteTask': 'Delete task',
		'renderer.addTask': '+ Add task...',
		'renderer.editTask': 'Edit task:',
		'renderer.editCardTitle': 'Edit title:',
		'renderer.writeThoughts': 'Write your thoughts...',
		'renderer.addDocument': '+ Add document...',
		'renderer.removeDoc': 'Remove doc',
		'renderer.setMemoColor': 'Set memo color (hex)',
		'renderer.setCoverImage': 'Set cover image',
		'renderer.coverImagePath': 'Cover image path (vault relative)',
		'renderer.dayStreak': '{count} day streak',

		// Banner
		'banner.editLabel': 'Edit banner',
		'banner.editTitle': 'Edit banner',
		'banner.quote': 'Quote',
		'banner.author': 'Author',
		'banner.imagePath': 'Background image path (vault relative)',

		// Quick Links
		'quickLinks.title': 'Quick Links',
		'quickLinks.empty': 'No quick links yet.',
		'quickLinks.addLink': '+ Add link',
		'quickLinks.addQuickLink': 'Add quick link',
		'quickLinks.addDocLink': 'Add document link',
		'quickLinks.searchDocs': 'Search documents...',
		'quickLinks.typeToSearch': 'Type to search documents',
		'quickLinks.noDocsFound': 'No documents found',

		// Recent
		'recent.title': 'Recently Edited',
		'recent.empty': 'No recent documents.',
		'recent.daysAgo': '{count}d ago',
		'recent.hoursAgo': '{count}h ago',
		'recent.minutesAgo': '{count}m ago',
		'recent.justNow': 'just now',

		// Card Edit
		'cardEdit.title': 'Edit card',
		'cardEdit.titleLabel': 'Title',
		'cardEdit.coverImage': 'Cover image path',
		'cardEdit.coverImagePlaceholder': 'attachments/cover.jpg',
		'cardEdit.linkedDocs': 'Linked documents',
		'cardEdit.noDocs': 'No documents linked.',
		'cardEdit.searchDocs': 'Search & add documents',
		'cardEdit.addSelected': 'Add selected',
		'cardEdit.addSelectedCount': 'Add {count} documents',

		// Sync defaults
		'sync.memoTitle': '{date} memo',
		'sync.todoTitle': 'To-Do',
		'sync.projectTitle': 'New Project',
		'sync.newCard': 'New card',
	},
	zh: {
		// Common
		'common.save': '保存',
		'common.cancel': '取消',
		'common.open': '打开 {name}',
		'common.remove': '移除 {name}',

		// Settings
		'settings.dashboardFile': '仪表盘文件',
		'settings.dashboardFileDesc': '仪表盘 Markdown 文件路径（如 dashboard 或 notes/dashboard，无需 .md 后缀）',
		'settings.theme': '主题',
		'settings.themeDesc': '仪表盘颜色主题',
		'settings.themeAuto': '自动',
		'settings.themeLight': '浅色',
		'settings.themeDark': '深色',
		'settings.recentCount': '最近文档数量',
		'settings.recentCountDesc': '侧边栏显示的最近文档数量',
		'settings.language': '语言',
		'settings.languageDesc': '界面语言',
		'settings.languageEn': 'English',
		'settings.languageZh': '中文',

		// Style Presets
		'settings.stylePreset': '样式',
		'settings.stylePresetDesc': '仪表盘视觉样式',
		'settings.styleEarth': '大地',
		'settings.styleNordic': '北欧',
		'settings.styleNeon': '青绿',
		'settings.styleAurora': '极光',
		'settings.stylePrism': '春日',
				
		// Main
		'main.openDashboard': '打开工作台',
		'main.dashboard': '工作台',

		// Renderer
		'renderer.addSection': '+ 添加分区',
		'renderer.sectionName': '分区名称：',
		'renderer.addCardTo': '添加卡片到 {column}',
		'renderer.editCard': '编辑卡片',
		'renderer.deleteCard': '删除卡片',
		'renderer.moveUp': '上移',
		'renderer.moveDown': '下移',
		'renderer.deleteTask': '删除任务',
		'renderer.addTask': '+ 添加任务...',
		'renderer.editTask': '编辑任务：',
		'renderer.editCardTitle': '编辑标题：',
		'renderer.writeThoughts': '写下你的想法...',
		'renderer.addDocument': '+ 添加文档...',
		'renderer.removeDoc': '移除文档',
		'renderer.setMemoColor': '设置备忘录颜色（十六进制，如 #f59e0b）',
		'renderer.setCoverImage': '设置封面图片',
		'renderer.coverImagePath': '封面图片路径（相对于仓库）',
		'renderer.dayStreak': '{count} 天连续',

		// Banner
		'banner.editLabel': '编辑横幅',
		'banner.editTitle': '编辑横幅',
		'banner.quote': '引言',
		'banner.author': '作者',
		'banner.imagePath': '背景图片路径（相对于仓库）',

		// Quick Links
		'quickLinks.title': '快捷链接',
		'quickLinks.empty': '暂无快捷链接。',
		'quickLinks.addLink': '+ 添加链接',
		'quickLinks.addQuickLink': '添加快捷链接',
		'quickLinks.addDocLink': '添加文档链接',
		'quickLinks.searchDocs': '搜索文档...',
		'quickLinks.typeToSearch': '输入以搜索文档',
		'quickLinks.noDocsFound': '未找到文档',

		// Recent
		'recent.title': '最近编辑',
		'recent.empty': '暂无最近文档。',
		'recent.daysAgo': '{count}天前',
		'recent.hoursAgo': '{count}小时前',
		'recent.minutesAgo': '{count}分钟前',
		'recent.justNow': '刚刚',

		// Card Edit
		'cardEdit.title': '编辑卡片',
		'cardEdit.titleLabel': '标题',
		'cardEdit.coverImage': '封面图片路径',
		'cardEdit.coverImagePlaceholder': 'attachments/cover.jpg',
		'cardEdit.linkedDocs': '已链接文档',
		'cardEdit.noDocs': '暂无链接文档。',
		'cardEdit.searchDocs': '搜索并添加文档',
		'cardEdit.addSelected': '添加选中',
		'cardEdit.addSelectedCount': '添加 {count} 个文档',

		// Sync defaults
		'sync.memoTitle': '{date} 备忘录',
		'sync.todoTitle': '待办清单',
		'sync.projectTitle': '新项目',
		'sync.newCard': '新卡片',
	},
};

export function t(key: string, params?: Record<string, string | number>): string {
	let str = translations[currentLang][key] ?? translations.en[key] ?? key;
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			str = str.replace(`{${k}}`, String(v));
		}
	}
	return str;
}
