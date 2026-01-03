 /*-------------------------------------------------------*/
 /*        PL/I text descriptions for signals             */
 /*-------------------------------------------------------*/
 dcl   1 sig_desc_tbl        external,
         5 sig_max           fixed bin(31)       init(31),
         5 sig_desc      (31)char(10)  varying   init(
           'SIGHUP',   'SIGINT',   'SIGQUIT',  'SIGILL',
           'SIGTRAP',  'SIGABRT',  'SIGBUS',   'SIGFPE',
           'SIGKILL',  'SIGUSR1',  'SIGSEGV',  'SIGUSR2',
           'SIGPIPE',  'SIGALRM',  'SIGTERM',  'SIGSTKFLT',
           'SIGCHLD',  'SIGCONT',  'SIGSTOP',  'SIGTSTP',
           'SIGXCPU',  'SIGXFSZ',  'SIGVTALRM','SIGPROF',
           'SIGWINCH', 'SIGGIO',   'SIGPWR',   'SIGSYS' );

