/*--------------------------------------------------------*/
/*        PL/I equivalent of fcntl.h                      */
/*--------------------------------------------------------*/ 
/* Open Mode Flags */
%replace O_ACCMODE    by '03000000'bx;
%replace O_RDONLY     by '00000000'bx;
%replace O_WRONLY     by '01000000'bx;
%replace O_RDWR       by '02000000'bx;
%replace O_CREAT      by '40000000'bx;
%replace O_EXCL       by '80000000'bx;
%replace O_NOCTTY     by '00010000'bx;
%replace O_TRUNC      by '00020000'bx;
%replace O_APPEND     by '00040000'bx;
%replace O_NONBLOCK   by '00080000'bx;
%replace O_NDELAY     by '00080000'bx;
%replace O_SYNC       by '00100000'bx;
%replace FASYNC       by '00200000'bx;
%replace O_DIRECT     by '00400000'bx;
%replace O_LARGEFILE  by '00800000'bx;
%replace O_DIRECTORY  by '00000100'bx;
%replace O_NOFOLLOW   by '00000200'bx;
%replace O_NOATIME    by '00000400'bx;
%replace O_RANDOM     by '00000800'bx; /* Added 2010-06-23*/
