import { GeneralAgent } from './agents/general_agent';

async function main() {
  console.log('[Type /bye, /quit, or /exit to quit]');
  const generalAgent = new GeneralAgent();

  const prefix = '\n[You]: ';
  process.stdout.write(prefix);
  for await (const line of console) {
    if (line == '/bye' || line == '/quit' || line == '/exit') {
      console.log('\n[GeneralAgent]: Goodbye!');
      break;
    }
    const response = await generalAgent.run(line);
    console.log('\n[GeneralAgent]: ' + response);
    process.stdout.write(prefix);
  }

}

main();