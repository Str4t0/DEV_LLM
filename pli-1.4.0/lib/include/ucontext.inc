/*********************************************************************/
/* ucontext.inc -- PL/I translation of Linux ucontext.h              */
/*********************************************************************/
dcl    1 ucontext            based,
         5 uc_flags          fixed bin(31),                      /*00*/
         5 uc_link           ptr,                                /*04*/
         5 uc_stack,                        /* stack_t             08*/
           10 ss_sp          ptr,                                /*08*/
           10 ss_flags       fixed bin(31),                      /*0C*/
           10 ss_size        fixed bin(31),                      /*10*/
         5 uc_mcontext       char(0);       /* H/W context         14*/
         /* uc_sigmask follows hardware context                      */
