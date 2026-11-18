import { runDemoSeed } from './seed/demo';

runDemoSeed((message) => {
  // eslint-disable-next-line no-console
  console.log(message);
}).catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
