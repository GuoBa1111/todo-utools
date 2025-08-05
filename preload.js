const fs = require('node:fs');
// 暴露到window.utoolsApi对象中
window.services  = {  
  // 写入文件示例
  writeFile: (filePath, content) => {
    return fs.writeFileSync(filePath, content, 'utf-8');
  },
};