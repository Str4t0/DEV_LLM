/*--------------------------------------------------------*/
/*        PL/I definitions for ERRNO                      */
/*--------------------------------------------------------*/
 
%replace	EPERM	   by	 1;	/* Operation not permitted */
%replace	ENOENT	   by	 2;	/* No such file or directory */
%replace	ESRCH	   by	 3;	/* No such process */
%replace	EINTR	   by	 4;	/* Interrupted system call */
%replace	EIO	   by	 5;	/* I/O error */
%replace	ENXIO	   by	 6;	/* No such device or address */
%replace	E2BIG	   by	 7;	/* Argument list too long */
%replace	ENOEXEC    by	 8;	/* Exec format error */
%replace	EBADF	   by	 9;	/* Bad file number */
%replace	ECHILD	   by	10;	/* No child processes */
%replace	EAGAIN	   by	11;	/* Try again */
%replace	ENOMEM	   by	12;	/* Out of memory */
%replace	EACCES	   by	13;	/* Permission denied */
%replace	EFAULT	   by	14;	/* Bad address */
%replace	ENOTBLK	   by	15;	/* Block device required */
%replace	EBUSY	   by	16;	/* Device or resource busy */
%replace	EEXIST	   by	17;	/* File exists */
%replace	EXDEV	   by	18;	/* Cross-device link */
%replace	ENODEV	   by	19;	/* No such device */
%replace	ENOTDIR	   by	20;	/* Not a directory */
%replace	EISDIR	   by	21;	/* Is a directory */
%replace	EINVAL	   by	22;	/* Invalid argument */
%replace	ENFILE	   by	23;	/* File table overflow */
%replace	EMFILE	   by	24;	/* Too many open files */
%replace	ENOTTY	   by	25;	/* Not a typewriter */
%replace	ETXTBSY	   by	26;	/* Text file busy */
%replace	EFBIG	   by	27;	/* File too large */
%replace	ENOSPC	   by	28;	/* No space left on device */
%replace	ESPIPE	   by	29;	/* Illegal seek */
%replace	EROFS	   by	30;	/* Read-only file system */
%replace	EMLINK	   by	31;	/* Too many links */
%replace	EPIPE	   by	32;	/* Broken pipe */
%replace	EDOM	   by	33;	/* Math argument out of domain of func */
%replace	ERANGE	   by	34;	/* Math result not representable */
%replace	EDEADLK	   by   35;	/* Resource deadlock would occur */
%replace	ENAMETOOLONG by 36;	/* File name too long */
%replace	ENOLCK	   by	37;	/* No record locks available */
%replace	ENOSYS	   by	38;	/* Function not implemented */
%replace	ENOTEMPTY  by	39;	/* Directory not empty */
%replace	ELOOP	   by	40;	/* Too many symbolic links encountered */
%replace	EWOULDBLOCK by	41;   	/* Operation would block (same as EAGAIN) */
%replace	ENOMSG	   by	42;	/* No message of desired type */
%replace	EIDRM	   by	43;	/* Identifier removed */
%replace	ECHRNG	   by	44;	/* Channel number out of range */
%replace	EL2NSYNC   by	45;	/* Level 2 not synchronized */
%replace	EL3HLT	   by	46;	/* Level 3 halted */
%replace	EL3RST	   by	47;	/* Level 3 reset */
%replace	ELNRNG	   by	48;	/* Link number out of range */
%replace	EUNATCH	   by	49;	/* Protocol driver not attached */
%replace	ENOCSI	   by	50;	/* No CSI structure available */
%replace	EL2HLT	   by	51;	/* Level 2 halted */
%replace	EBADE	   by	52;	/* Invalid exchange */
%replace	EBADR	   by	53;	/* Invalid request descriptor */
%replace	EXFULL	   by	54;	/* Exchange full */
%replace	ENOANO	   by	55;	/* No anode */
%replace	EBADRQC	   by	56;	/* Invalid request code */
%replace	EBADSLT	   by	57;	/* Invalid slot */
%replace	EDEADLOCK  by   58;     /* (same as EDEADLK) */
%replace	EBFONT	   by	59;	/* Bad font file format */
%replace	ENOSTR	   by	60;	/* Device not a stream */
%replace	ENODATA	   by	61;	/* No data available */
%replace	ETIME	   by	62;	/* Timer expired */
%replace	ENOSR	   by	63;	/* Out of streams resources */
%replace	ENONET	   by	64;	/* Machine is not on the network */
%replace	ENOPKG	   by	65;	/* Package not installed */
%replace	EREMOTE	   by	66;	/* Object is remote */
%replace	ENOLINK	   by	67;	/* Link has been severed */
%replace	EADV	   by	68;	/* Advertise error */
%replace	ESRMNT	   by	69;	/* Srmount error */
%replace	ECOMM	   by	70;	/* Communication error on send */
%replace	EPROTO	   by	71;	/* Protocol error */
%replace	EMULTIHOP  by	72;	/* Multihop attempted */
%replace	EDOTDOT	   by	73;	/* RFS specific error */
%replace	EBADMSG	   by	74;	/* Not a data message */
%replace	EOVERFLOW  by	75;	/* Value too large for defined data type */
%replace	ENOTUNIQ   by	76;	/* Name not unique on network */
%replace	EBADFD	   by	77;	/* File descriptor in bad state */
%replace	EREMCHG	   by	78;	/* Remote address changed */
%replace	ELIBACC	   by	79;	/* Can not access a needed shared library */
%replace	ELIBBAD	   by	80;	/* Accessing a corrupted shared library */
%replace	ELIBSCN	   by	81;	/* .lib section in a.out corrupted */
%replace	ELIBMAX	   by	82;	/* Attempting to link in too many shared libraries */
%replace	ELIBEXEC   by	83;	/* Cannot exec a shared library directly */
%replace	EILSEQ	   by	84;	/* Illegal byte sequence */
%replace	ERESTART   by	85;	/* Interrupted system call should be restarted */
%replace	ESTRPIPE   by	86;	/* Streams pipe error */
%replace	EUSERS	   by	87;	/* Too many users */
%replace	ENOTSOCK   by	88;	/* Socket operation on non-socket */
%replace	EDESTADDRREQ by	89;	/* Destination address required */
%replace	EMSGSIZE   by	90;	/* Message too long */
%replace	EPROTOTYPE by	91;	/* Protocol wrong type for socket */
%replace	ENOPROTOOPT by	92;	/* Protocol not available */
%replace	EPROTONOSUPPORT	by 93;	/* Protocol not supported */
%replace	ESOCKTNOSUPPORT	by 94;	/* Socket type not supported */
%replace	EOPNOTSUPP   by	95;	/* Operation not supported on transport endpoint */
%replace	EPFNOSUPPORT by	96;	/* Protocol family not supported */
%replace	EAFNOSUPPORT by	97;	/* Address family not supported by protocol */
%replace	EADDRINUSE   by	98;	/* Address already in use */
%replace	EADDRNOTAVAIL by 99;	/* Cannot assign requested address */
%replace	ENETDOWN     by	100;	/* Network is down */
%replace	ENETUNREACH  by	101;	/* Network is unreachable */
%replace	ENETRESET    by	102;	/* Network dropped connection because of reset */
%replace	ECONNABORTED by	103;	/* Software caused connection abort */
%replace	ECONNRESET   by	104;	/* Connection reset by peer */
%replace	ENOBUFS	     by	105;	/* No buffer space available */
%replace	EISCONN	     by	106;	/* Transport endpoint is already connected */
%replace	ENOTCONN     by	107;	/* Transport endpoint is not connected */
%replace	ESHUTDOWN    by	108;	/* Cannot send after transport endpoint shutdown */
%replace	ETOOMANYREFS by	109;	/* Too many references: cannot splice */
%replace	ETIMEDOUT    by	110;	/* Connection timed out */
%replace	ECONNREFUSED by	111;	/* Connection refused */
%replace	EHOSTDOWN    by	112;	/* Host is down */
%replace	EHOSTUNREACH by	113;	/* No route to host */
%replace	EALREADY     by	114;	/* Operation already in progress */
%replace	EINPROGRESS  by	115;	/* Operation now in progress */
%replace	ESTALE	     by	116;	/* Stale NFS file handle */
%replace	EUCLEAN	     by	117;	/* Structure needs cleaning */
%replace	ENOTNAM	     by	118;	/* Not a XENIX named type file */
%replace	ENAVAIL	     by	119;	/* No XENIX semaphores available */
%replace	EISNAM	     by	120;	/* Is a named type file */
%replace	EREMOTEIO    by	121;	/* Remote I/O error */
%replace	EDQUOT	     by	122;	/* Quota exceeded */
%replace	ENOMEDIUM    by	123;	/* No medium found */
%replace	EMEDIUMTYPE  by	124;	/* Wrong medium type */ 
