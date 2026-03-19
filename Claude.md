* Always wrap all environment-specifics (OS, File system, time, network) in abstractions that can be injected and mockable
* Always pass any referenced timestamps into methods as parameters so they can be properly provided in tests
* Always employ strict TDD
* Always strice for modularity and configurability.