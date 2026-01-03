 /* 'Task Startup Block' (TSB) - data needed to start task.          */
 /* Fields are initialized in CALL (C), _pli_Task (T),               */
 /* or left uninitialized (x).                                       */
 dcl   1 TSB                 based,
         5 TSB_entryaddr     entry          /* ->Procedure entry(C)00*/
                             options( linkage(system) ),
         5 TSB_argcnt        fixed bin(31), /* Number of args   (C)08*/
         5 TSB_flags         unaligned,     /*                  (C)0C*/
           10 TSB_PLI_linkage bit(1),       /* '1'b = PL/I linkage   */
           10 fil0           bit(7),        /* Unassigned            */
         5 TSB_version       bit(8) aligned,/* Ctl Blk Version  (C)0D*/
           /* This is version 0.                                     */
         5 fil1              char(2),       /* alignment        (x)0E*/
         5 TSB_pONCB         ptr,           /* ->ONCB chain     (T)10*/
         5 TSB_pTask         ptr,           /* ->Task variable  (C)14*/
         5 TSB_pEvent        ptr,           /* ->Event variable (C)18*/
         5 TSB_parent        ptr,           /* ->parent TCB     (T)1C*/
         5 TSB_priority      fixed bin(31), /* Priority adj     (C)20*/
         5 TSB_pStart        ptr,           /* ->Startup event  (C)24*/
         5 fil2              char(16),      /* reserved         (x)28*/
         5 TSB_arginfo   (64)bit(1) unaligned,   /* Arg descript(C)38*/
           /* PL/I linkage only, uninitialized for system linkage    */
           /* '0'b - argument address ->Data                         */
           /* '1'b - argument address ->Locator/Descriptor           */
         5 TSB_end           char(0);       /* End of TSB          40*/

