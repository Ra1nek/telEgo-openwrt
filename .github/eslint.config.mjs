export default [
	{
		files: ['package/luci-app-telego/htdocs/resources/view/telego/*.js'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'script',
			parserOptions: {
				ecmaFeatures: {
					globalReturn: true
				}
			}
		}
	}
];
