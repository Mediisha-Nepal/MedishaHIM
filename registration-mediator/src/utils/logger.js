const ts = () => new Date().toISOString();

export const logger = {
  debug: (...args) => console.debug(ts(), '[DEBUG]', ...args),
  info: (...args) => console.log(ts(), '[INFO]', ...args),
  warn: (...args) => console.warn(ts(), '[WARN]', ...args),
  error: (...args) => console.error(ts(), '[ERROR]', ...args),
};
