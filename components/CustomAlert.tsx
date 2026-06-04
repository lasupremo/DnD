import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  buttons?: AlertButton[];
  onClose: () => void;
}

export default function CustomAlert({ visible, title, message, buttons = [], onClose }: CustomAlertProps) {
  if (!visible) return null;

  const alertButtons = buttons.length > 0 ? buttons : [{ text: 'OK', onPress: onClose }];

  return (
    <View style={styles.overlay}>
      <View style={styles.alertBox}>
        
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        <View style={styles.buttonContainer}>
          {alertButtons.map((btn, index) => {
            const isCancel = btn.style === 'cancel';
            const isDestructive = btn.style === 'destructive';
            
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.button,
                  isCancel && styles.cancelButton,
                  isDestructive && styles.destructiveButton,
                  !isCancel && !isDestructive && styles.defaultButton,
                  { flex: 1 }
                ]}
                onPress={() => {
                  if (btn.onPress) btn.onPress();
                  onClose(); 
                }}
              >
                <Text style={[
                  styles.buttonText,
                  isCancel && styles.cancelText,
                ]}>
                  {btn.text.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
    elevation: 9999,
  },
  alertBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultButton: {
    backgroundColor: '#4877FF',
  },
  destructiveButton: {
    backgroundColor: '#FF4A58',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#444',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  cancelText: {
    color: '#888',
  }
});