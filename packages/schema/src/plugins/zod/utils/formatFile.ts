import prettier from 'prettier';

export const formatFile = (content: string): Promise<string> => {
  return new Promise((res, rej) =>
    prettier.resolveConfig(process.cwd()).then((options) => {
      let formatOptions = options;
      if (!options) {
        formatOptions = {
          trailingComma: 'all',
          tabWidth: 2,
          printWidth: 80,
          bracketSpacing: true,
          semi: true,
          singleQuote: true,
          useTabs: false,
        };
      }

      try {
        const formatted = prettier.format(content, {
          ...formatOptions,
          parser: 'typescript',
        });

        res(formatted);
      } catch (error) {
        rej(error);
      }
    }),
  );
};
