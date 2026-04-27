
'use client';

import React, { DependencyList, createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc, onSnapshot } from 'firebase/firestore';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener'
import { Role } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

interface FirebaseProviderProps {
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}

// Perfil de usuario extendido
interface UserProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: Role;
  locationId: string;
}

// Internal state for user authentication
interface UserAuthState {
  user: User | null;
  profile: UserProfile | null;
  role: Role | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// Combined state for the Firebase context
export interface FirebaseContextState extends UserAuthState {
  areServicesAvailable: boolean;
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
}

// Return type for useFirebase()
export interface FirebaseServicesAndUser extends UserAuthState {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}

// React Context
export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

/**
 * FirebaseProvider manages and provides Firebase services and user authentication state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
}) => {
  const [userAuthState, setUserAuthState] = useState<UserAuthState>({
    user: null,
    profile: null,
    role: null,
    isUserLoading: true,
    userError: null,
  });

  // Effect to subscribe to Firebase auth state changes and Firestore profile
  useEffect(() => {
    if (!auth || !firestore) {
      setUserAuthState(prev => ({ ...prev, isUserLoading: false }));
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (firebaseUser) {
          // Si hay usuario, escuchamos su perfil en Firestore
          const userRef = doc(firestore, 'users', firebaseUser.uid);
          const unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const profileData = docSnap.data() as UserProfile;
              setUserAuthState({
                user: firebaseUser,
                profile: profileData,
                role: profileData.role,
                isUserLoading: false,
                userError: null,
              });
            } else {
              // Si no tiene perfil aún (primer login), lo tratamos como cargado pero sin rol
              setUserAuthState({
                user: firebaseUser,
                profile: null,
                role: null,
                isUserLoading: false,
                userError: null,
              });
            }
          }, async (err) => {
            // No usamos console.error aquí para evitar ruidos en el sistema de errores contextuales
            const permissionError = new FirestorePermissionError({
              path: userRef.path,
              operation: 'get',
            });
            errorEmitter.emit('permission-error', permissionError);
            setUserAuthState(prev => ({ 
              ...prev, 
              user: firebaseUser, 
              isUserLoading: false,
              userError: permissionError 
            }));
          });

          return () => unsubscribeProfile();
        } else {
          // No hay usuario
          setUserAuthState({
            user: null,
            profile: null,
            role: null,
            isUserLoading: false,
            userError: null,
          });
        }
      },
      (error) => {
        setUserAuthState({ user: null, profile: null, role: null, isUserLoading: false, userError: error });
      }
    );

    return () => unsubscribeAuth();
  }, [auth, firestore]);

  const contextValue = useMemo((): FirebaseContextState => {
    const servicesAvailable = !!(firebaseApp && firestore && auth);
    return {
      areServicesAvailable: servicesAvailable,
      firebaseApp: servicesAvailable ? firebaseApp : null,
      firestore: servicesAvailable ? firestore : null,
      auth: servicesAvailable ? auth : null,
      ...userAuthState,
    };
  }, [firebaseApp, firestore, auth, userAuthState]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = (): FirebaseServicesAndUser => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider.');
  }
  if (!context.areServicesAvailable || !context.firebaseApp || !context.firestore || !context.auth) {
    throw new Error('Firebase core services not available.');
  }
  return {
    firebaseApp: context.firebaseApp,
    firestore: context.firestore,
    auth: context.auth,
    user: context.user,
    profile: context.profile,
    role: context.role,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
  };
};

export const useAuth = () => useFirebase().auth;
export const useFirestore = () => useFirebase().firestore;
export const useFirebaseApp = () => useFirebase().firebaseApp;

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T & {__memo?: boolean} {
  const memoized = useMemo(factory, deps) as any;
  if (memoized && typeof memoized === 'object') memoized.__memo = true;
  return memoized;
}

export const useUser = () => {
  const { user, profile, role, isUserLoading, userError } = useFirebase();
  return { user, profile, role, isUserLoading, userError };
};
