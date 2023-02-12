import { BigNumber, ethers } from 'ethers';
import pino from 'pino';
import readline from 'readline';

import Sniper from '../libs/sniper.js';

type Snipe = (
  walletName: string,
  chain: string,
  token: string,
  dex: string,
  options?: {
    password?: string;
    totalSpend?: number;
    loopSpend?: number;
    forceGas?: number;
  },
) => Promise<void>;

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

const snipe: Snipe = async (
  walletName,
  chainName,
  tokenAddress,
  dexName,
  options,
) => {
  const sniper = new Sniper(
    walletName,
    chainName,
    tokenAddress,
    dexName,
    options,
  );

  const pair = await sniper.findOperatingPair();

  if (!pair) {
    throw new Error('Could not find a pair with liquidity');
  }

  // ////////////////////////////////////////
  // INTERACTIVE PROMPT
  // ////////////////////////////////////////
  let errorCount = 0;
  const maxErrorCount = sniper.getChainConfiguration().misc.maxErrorCount;

  // Get ready for looping/timeout
  let loopTimeout: NodeJS.Timeout | undefined;

  const interactiveShell = async (): Promise<void> => {
    if (errorCount >= maxErrorCount) {
      logger.fatal('Max error count reached - exiting...');
      process.exit(1);
    }

    try {
      const sourceToken = pair.getSourceToken();
      const targetToken = pair.getTargetToken();

      const {
        blockNumber,
        perSourceTokenPrice,
        perTargetTokenPrice,
        targetTokenBalance,
        sourceTokenBalance,
      } = await sniper.getInteractiveShellData(pair);

      // Price for 1 ETH (or native token) to target token amount
      const perSourceTokenPriceNumber = parseFloat(
        ethers.utils.formatUnits(perSourceTokenPrice, sourceToken.decimals),
      );

      // This is inverse price of above
      const perTargetTokenPriceNumber = parseFloat(
        ethers.utils.formatUnits(perTargetTokenPrice, targetToken.decimals),
      );

      const targetTokenBalanceNumber = parseFloat(
        ethers.utils.formatUnits(targetTokenBalance, targetToken.decimals),
      );

      const priceImpact = await pair.getPriceImpactFromTargetToken(
        targetTokenBalance,
      );

      console.clear();
      console.log(
        `Last Update: ${new Date()}\n`,
        `Block Number: ${blockNumber}\n`,
        `Price: ${perSourceTokenPriceNumber.toFixed(32)} ${
          sourceToken.name
        } / 1 ${pair.getTargetToken().name}\n`,
        `Balance for Token ${targetToken.name}: ${ethers.utils.formatUnits(
          targetTokenBalance,
          targetToken.decimals,
        )}\n`,
        `Balance for Token ${sourceToken.name}: ${ethers.utils.formatUnits(
          sourceTokenBalance,
          sourceToken.decimals,
        )}\n`,
        `Value of your ${targetToken.name} in ${sourceToken.name}: ${
          targetTokenBalanceNumber * perTargetTokenPriceNumber
        }\n`,
        `Price impact of your ${targetToken.name} in ${sourceToken.name}: ${priceImpact}%\n`,
        `\n`,
        `What do you want to do?\n`,
        `Buy: "b<number>"\n`,
        `Sell All: "sa"\n`,
        `Sell: "s<number>" as % of holdings\n`,
      );
    } catch (error) {
      const stack = (error as Error).stack;

      logger.error(
        { error, stack: stack ? stack.split(`\n`) : undefined },
        '[Error] Getting pair information',
      );
      errorCount += 1;
    }

    // Prompt for a response, once we get one
    // We want to break the pair information loop and close the log updater
    const prompt = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (sniper.getChainConfiguration().misc.refreshInteractive) {
      loopTimeout = setTimeout(() => {
        interactiveShell();
        prompt.close();
      }, sniper.getChainConfiguration().misc.interactiveRefreshInSeconds * 1000);
    }

    // Depending on our answer, we show feedback adn run again
    // or just let er goooooo
    prompt.question(' ', async (answer) => {
      // We always handle shit after, so nuke the timeout and close the prompt
      clearTimeout(loopTimeout);
      prompt.close();

      // Handle bad response
      if (!/^b\d+|sa|s\d+$/.test(answer)) {
        console.log(
          'Response must be in the form of "b2000", "sa" or "s50" - please try again',
        );

        return setTimeout(() => {
          interactiveShell();
        }, 1000);
      }

      // Deal with valid answers
      if (answer === 'sa') {
        const receipt = await pair.sellPercent(100);

        console.log('==== Transaction mined');
        console.dir(receipt, { depth: null, maxArrayLength: null });
      } else if (answer.startsWith('s')) {
        const receipt = await pair.sellPercent(parseFloat(answer.slice(1)));

        console.log('==== Transaction mined');
        console.dir(receipt, { depth: null, maxArrayLength: null });
      } else {
        const receipt = await pair.buy(parseFloat(answer.slice(1)));

        console.log('==== Transaction mined');
        console.dir(receipt, { depth: null, maxArrayLength: null });
      }
    });
  };

  // ////////////////////////////////////////
  // CHECK TOTAL/LOOP SPEND AND INTERACTIVE
  // ////////////////////////////////////////

  const { totalSpend, spendPerLoop } = pair.getSourceToken().config;

  if (totalSpend > 0 && (!spendPerLoop || spendPerLoop === 0)) {
    logger.info(
      {
        totalSpend,
      },
      'Entering automatic mode - total spend set',
    );

    const transaction = await pair.buy(totalSpend);

    console.log('==== Transaction mined');
    console.dir(transaction, { depth: null, maxArrayLength: null });
  } else if (totalSpend && spendPerLoop && spendPerLoop > 0) {
    logger.info(
      {
        totalSpend,
        spendPerLoop,
      },
      'Entering automatic loop mode - total spend and spend per loop set',
    );

    const loopTime = sniper.getChainConfiguration().misc.loopTimeInSeconds;

    if (loopTime < 1) {
      throw new Error(`Loop time "${loopTime}" should not be less than 1`);
    }

    const totalSpent = 0;

    // TODO: Loop spend
  } else {
    logger.info('Entering interactive mode - total spend not set');

    interactiveShell();
  }
};

export default snipe;
