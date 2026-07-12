import { ethers } from 'ethers';
import pino from 'pino';
import readline from 'readline';

import { LOG_LEVEL } from '../constants.js';
import Pair from '../libs/pair.js';
import Sniper from '../libs/sniper.js';

type TransactionRecipt = Awaited<
  ReturnType<
    typeof ethers.providers.JsonRpcProvider.prototype.getTransactionReceipt
  >
>;

interface TransactionExceptionError {
  code: 0;
  receipt: TransactionRecipt;
}

type TransactionError = TransactionExceptionError;

type Snipe = (
  walletName: string,
  chain: string,
  dex: string,
  token: string,
  options?: {
    password?: string;
    totalSpend?: number;
    loopSpend?: number;
    forceGas?: number;
    sourceToken?: string;
    exactApproval?: boolean;
  },
) => Promise<void>;

const logger = pino({
  name: 'command::snipe',
  level: LOG_LEVEL,
});

const logMinedTransaction = (receipt: TransactionRecipt, explorer: string) => {
  const base = explorer.replace(/\/+$/, '');

  logger.info(
    {
      transactionHash: receipt.transactionHash,
      url: `${base}/tx/${receipt.transactionHash}`,
    },
    'Transaction mined',
  );
};

const snipe: Snipe = async (
  walletName,
  chainName,
  dexName,
  tokenAddress,
  options,
) => {
  const sniper = new Sniper(
    walletName,
    chainName,
    tokenAddress,
    dexName,
    options,
  );

  const targetToken = await sniper.getTargetToken();
  const checkableTokens = await sniper.getCheckableTokens();

  const findPairLoop = async (): Promise<Pair> => {
    const loopTimeoutSeconds = 5;

    const pair = await sniper.findOperatingPair();

    if (!pair) {
      logger.info(
        `Could not find liquidity for "${
          targetToken.name
        }" against ${checkableTokens
          .map((ct) => `"${ct.name}"`)
          .join(
            ', ',
          )} - sleeping and checking again in ${loopTimeoutSeconds} seconds`,
      );

      await new Promise((resolve) =>
        setTimeout(resolve, loopTimeoutSeconds * 1000),
      );

      return findPairLoop();
    }

    return pair;
  };

  const pair = await findPairLoop();

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
      if (!/^b\d+(\.\d+)?|sa|s\d+(\.\d+)?$/.test(answer)) {
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

        logMinedTransaction(receipt, explorer);
      } else if (answer.startsWith('s')) {
        const receipt = await pair.sellPercent(parseFloat(answer.slice(1)));

        logMinedTransaction(receipt, explorer);
      } else {
        const receipt = await pair.buy(parseFloat(answer.slice(1)));

        logMinedTransaction(receipt, explorer);
      }
    });
  };

  // ////////////////////////////////////////
  // CHECK TOTAL/LOOP SPEND AND INTERACTIVE
  // ////////////////////////////////////////

  const { totalSpend, spendPerLoop } = pair.getSourceToken().config;
  const explorer = sniper.getChainConfiguration().explorer;

  const resolvedTotalSpend = options?.totalSpend
    ? options.totalSpend
    : totalSpend;

  if (resolvedTotalSpend > 0 && (!spendPerLoop || spendPerLoop === 0)) {
    logger.info(
      {
        totalSpend,
      },
      'Entering automatic mode - total spend set',
    );

    const receipt = await pair.buy(resolvedTotalSpend);

    logMinedTransaction(receipt, explorer);
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

    let errorCount = 0;
    const maxErrorCount = sniper.getChainConfiguration().misc.maxErrorCount;

    let totalSpent = 0;

    while (totalSpent < totalSpend) {
      if (errorCount >= maxErrorCount) {
        logger.fatal(
          {
            maxErrorCount,
          },
          'Reached max error count - exiting',
        );

        process.exit(1);
      }

      try {
        const receipt = await pair.buy(spendPerLoop);
        totalSpent += spendPerLoop;

        logMinedTransaction(receipt, explorer);
      } catch (error) {
        const transactionError = error as TransactionError;

        // CALL_EXCEPTION
        if (transactionError.code === 0) {
          logger.error(
            {
              error,
            },
            'Got error in loop spend mode - will continue trying',
          );

          errorCount += 1;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, loopTime * 1000));
    }
  } else {
    logger.info('Entering interactive mode - total spend not set');

    interactiveShell();
  }
};

export default snipe;
