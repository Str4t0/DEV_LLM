/*--------------------------------------------------------*/
/*        PL/I definitions for Signals                    */
/*--------------------------------------------------------*/
 
%replace	SIGHUP	   by	 1;	/* Hang-up        */
%replace	SIGINT	   by	 2;	/* Keyboard Intr  */
%replace	SIGQUIT	   by	 3;	/* Quit from Kbd  */
%replace	SIGILL	   by	 4;	/* Illegal Instr. */
%replace	SIGTRAP	   by	 5;	/* Debug brkpt    */
%replace	SIGABRT	   by	 6;	/* Abn. Term.     */
%replace	SIGIOT 	   by	 6;	/* Same as SIGABRT*/
%replace	SIGBUS	   by	 7;	/* Bus error      */
%replace	SIGFPE	   by	 8;	/* FPU except..   */
%replace	SIGKILL	   by	 9;	/* Force Terminate*/
%replace	SIGUSR1	   by	10;	/* User signal    */
%replace	SIGSEGV	   by	11;	/* Inv. Mem. ref. */
%replace	SIGUSR2	   by	12;	/* User signal    */
%replace	SIGPIPE	   by	13;	/* No readers     */
%replace	SIGALRM	   by	14;	/* RT clock       */
%replace	SIGTERM	   by	15;	/* Process term.  */
%replace	SIGSTKFLT  by	16;	/* FPU stack err. */
%replace	SIGCHLD    by	17;	/* Child term.    */
%replace	SIGCONT	   by	18;	/* Resume exec.   */
%replace	SIGSTOP	   by	19;	/* Stop exec.     */
%replace	SIGTSTP    by	20;	/* Stop from TTY  */
%replace	SIGTTIN	   by	21;	/* Bkgd req input */
%replace	SIGTTOU	   by	22;	/* Bkgd req output*/
%replace	SIGURG	   by	23;	/* Urgent socket c*/
%replace	SIGXCPU	   by	24;	/* CPU limit exc. */
%replace	SIGXFSZ	   by	25;	/* File size exc. */
%replace	SIGVTALRM  by	26;	/* Virt time clk  */
%replace	SIGPROF	   by	27;	/* Prof tmr clk   */
%replace	SIGWINCH   by	28;	/* Wind. resize   */
%replace	SIGGIO	   by	29;	/* I/O now possibl*/
%replace	SIGPOLL	   by	29;	/* Same as SIGIO  */
%replace	SIGPWR 	   by	30;	/* Power failure  */
%replace	SIGSYS 	   by	31;	/* Bad system call*/
%replace	SIGUNUSED  by	31;	/* Same as SIGSYS */
