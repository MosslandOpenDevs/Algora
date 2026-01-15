module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
    // CSS minification in production
    ...(process.env.NODE_ENV === 'production' ? { cssnano: { preset: 'default' } } : {}),
  },
};
