// Minimal fixture for SG-001 testing (MINIMAL_INIT_OPTIONS)
export const MINIMAL_INIT_OPTIONS = {
    ...DEFAULT_INIT_OPTIONS,
    components: {
        settings: true,
        statusline: false,
        helpers: false,
    },
    hooks: {
        ...DEFAULT_INIT_OPTIONS.hooks,
        userPromptSubmit: false,
        stop: false,
        notification: false,
    },
    skills: {
        core: true,
    },
};
