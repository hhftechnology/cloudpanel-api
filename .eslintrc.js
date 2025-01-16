// .eslintrc.js
export default {
    env: {
        node: true,
        es2024: true,
        jest: true
    },
    extends: [
        'eslint:recommended',
        'plugin:node/recommended',
        'plugin:jest/recommended',
        'plugin:prettier/recommended'
    ],
    plugins: ['jest'],
    parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module'
    },
    rules: {
        // Error prevention
        'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        'no-return-await': 'error',
        'no-await-in-loop': 'warn',
        'no-template-curly-in-string': 'error',

        // Best practices
        'array-callback-return': 'error',
        'consistent-return': 'error',
        'default-param-last': 'error',
        'eqeqeq': ['error', 'always'],
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'prefer-const': 'error',
        'prefer-promise-reject-errors': 'error',

        // Node.js specific
        'node/no-missing-import': 'off', // We're using ES modules
        'node/no-unsupported-features/es-syntax': ['error', {
            version: '>=18.0.0',
            ignores: ['modules']
        }],

        // Style consistency
        'arrow-body-style': ['error', 'as-needed'],
        'camelcase': ['error', { properties: 'never' }],
        'curly': ['error', 'all'],
        'no-mixed-operators': 'error',
        'no-multi-assign': 'error',

        // Documentation
        'require-jsdoc': ['warn', {
            require: {
                FunctionDeclaration: true,
                MethodDefinition: true,
                ClassDeclaration: true
            }
        }],
        'valid-jsdoc': ['warn', {
            requireReturn: false,
            requireParamDescription: true,
            requireReturnDescription: true
        }],

        // Testing
        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'error',
        'jest/prefer-to-have-length': 'warn',
        'jest/valid-expect': 'error',

        // Async/Promise handling
        'require-await': 'error',
        'no-async-promise-executor': 'error'
    },
    overrides: [
        {
            files: ['tests/**/*.js'],
            env: {
                jest: true
            },
            rules: {
                'require-jsdoc': 'off'
            }
        }
    ],
    settings: {
        jest: {
            version: 29
        }
    }
}